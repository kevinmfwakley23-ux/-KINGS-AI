import { mkdir, readFile, appendFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { IntelligenceProviderKind, ModelExecutionUsage } from "./model-interface";

export type PaidEscalationMode = "never" | "ask" | "allow";
export type EconomicRouteClass = "local" | "free" | "paid";

export interface EconomicBudgetLimit {
  maximumPaidCostUsd?: number;
  maximumPaidTokens?: number;
}

export interface ModelEconomicPolicy {
  mission?: EconomicBudgetLimit;
  day?: EconomicBudgetLimit;
  month?: EconomicBudgetLimit;
  paidEscalation: PaidEscalationMode;
}

export interface ModelEconomicAuthorizationRequest {
  missionId: string;
  routeClass: EconomicRouteClass;
  estimatedCostUsd?: number;
  estimatedPaidTokens?: number;
  ownerApprovedPaidEscalation?: boolean;
  now?: Date;
}

export interface ModelEconomicAuthorizationDecision {
  allowed: boolean;
  requiresOwnerApproval: boolean;
  reason: string;
  projected: {
    missionPaidCostUsd: number;
    dayPaidCostUsd: number;
    monthPaidCostUsd: number;
    missionPaidTokens: number;
    dayPaidTokens: number;
    monthPaidTokens: number;
  };
}

export interface ModelEconomicUsageEvent {
  id: string;
  missionId: string;
  providerId: string;
  modelId: string;
  routeClass: EconomicRouteClass;
  occurredAt: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedTokens: number;
  compressionSavedTokens: number;
  localTokens: number;
  freeTokens: number;
  paidTokens: number;
  reportedCostUsd: number;
  avoidedPaidCostUsd: number;
}

export interface ModelEconomicSummary {
  localTokens: number;
  freeTokens: number;
  paidTokens: number;
  cachedTokens: number;
  compressionSavedTokens: number;
  reportedPaidCostUsd: number;
  avoidedPaidCostUsd: number;
  totalModelTokens: number;
  events: number;
}

function finiteNonNegative(value: number | undefined, label: string): void {
  if (value === undefined) return;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`K.I.N.G.S. Model Economics: ${label} must be a finite non-negative number`);
  }
}

function utcDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function utcMonth(value: Date): string {
  return value.toISOString().slice(0, 7);
}

export function economicRouteClass(providerKind: IntelligenceProviderKind): EconomicRouteClass {
  if (providerKind === "internal-local" || providerKind === "internal-self-hosted") return "local";
  if (providerKind === "external-free") return "free";
  return "paid";
}

export class DurableModelEconomicsAuthority {
  constructor(private readonly ledgerPath: string) {
    if (!ledgerPath.trim()) throw new Error("K.I.N.G.S. Model Economics: ledger path is required");
  }

  async authorize(
    policy: ModelEconomicPolicy,
    request: ModelEconomicAuthorizationRequest,
  ): Promise<ModelEconomicAuthorizationDecision> {
    this.validatePolicy(policy);
    finiteNonNegative(request.estimatedCostUsd, "estimatedCostUsd");
    finiteNonNegative(request.estimatedPaidTokens, "estimatedPaidTokens");

    const now = request.now ?? new Date();
    const events = await this.readEvents();
    const usage = this.scopeUsage(events, request.missionId, now);
    const incrementCost = request.routeClass === "paid" ? request.estimatedCostUsd : 0;
    const incrementTokens = request.routeClass === "paid" ? request.estimatedPaidTokens : 0;

    const projected = {
      missionPaidCostUsd: usage.mission.cost + (incrementCost ?? 0),
      dayPaidCostUsd: usage.day.cost + (incrementCost ?? 0),
      monthPaidCostUsd: usage.month.cost + (incrementCost ?? 0),
      missionPaidTokens: usage.mission.tokens + (incrementTokens ?? 0),
      dayPaidTokens: usage.day.tokens + (incrementTokens ?? 0),
      monthPaidTokens: usage.month.tokens + (incrementTokens ?? 0),
    };

    if (request.routeClass !== "paid") {
      return {
        allowed: true,
        requiresOwnerApproval: false,
        reason: "Local/free route does not consume the paid budget.",
        projected,
      };
    }

    if (policy.paidEscalation === "never") {
      return {
        allowed: false,
        requiresOwnerApproval: false,
        reason: "Paid escalation is disabled by owner policy.",
        projected,
      };
    }

    // A hard dollar ceiling cannot safely authorize a paid route whose price is unknown.
    if (
      request.estimatedCostUsd === undefined &&
      [policy.mission, policy.day, policy.month].some((limit) => limit?.maximumPaidCostUsd !== undefined)
    ) {
      return {
        allowed: false,
        requiresOwnerApproval: false,
        reason: "Paid route cost is unknown and cannot pass a hard dollar budget ceiling.",
        projected,
      };
    }

    if (
      request.estimatedPaidTokens === undefined &&
      [policy.mission, policy.day, policy.month].some((limit) => limit?.maximumPaidTokens !== undefined)
    ) {
      return {
        allowed: false,
        requiresOwnerApproval: false,
        reason: "Paid token estimate is unknown and cannot pass a hard paid-token budget ceiling.",
        projected,
      };
    }

    const exceeded = this.exceeded(policy, projected);
    if (exceeded) {
      return {
        allowed: false,
        requiresOwnerApproval: false,
        reason: exceeded,
        projected,
      };
    }

    if (policy.paidEscalation === "ask" && request.ownerApprovedPaidEscalation !== true) {
      return {
        allowed: false,
        requiresOwnerApproval: true,
        reason: "Paid route is within budget but requires explicit owner approval before execution.",
        projected,
      };
    }

    return {
      allowed: true,
      requiresOwnerApproval: false,
      reason: request.ownerApprovedPaidEscalation
        ? "Owner-approved paid escalation is within all hard budgets."
        : "Paid route is within all hard budgets.",
      projected,
    };
  }

  async record(input: {
    id: string;
    missionId: string;
    providerId: string;
    modelId: string;
    providerKind: IntelligenceProviderKind;
    usage: ModelExecutionUsage;
    occurredAt?: Date;
    avoidedPaidCostUsd?: number;
  }): Promise<ModelEconomicUsageEvent> {
    const totalTokens = Math.max(0, input.usage.inputTokens + input.usage.outputTokens);
    const cachedTokens = Math.max(0, Math.min(input.usage.cachedTokens ?? 0, totalTokens));
    const compressionSavedTokens = Math.max(0, input.usage.savedTokens ?? 0);
    const routeClass = economicRouteClass(input.providerKind);
    const reportedCostUsd = Math.max(0, input.usage.reportedCostUsd ?? 0);
    const avoidedPaidCostUsd = Math.max(0, input.avoidedPaidCostUsd ?? 0);
    const nonCachedTokens = Math.max(0, totalTokens - cachedTokens);
    const event: ModelEconomicUsageEvent = {
      id: input.id,
      missionId: input.missionId,
      providerId: input.providerId,
      modelId: input.modelId,
      routeClass,
      occurredAt: (input.occurredAt ?? new Date()).toISOString(),
      inputTokens: input.usage.inputTokens,
      outputTokens: input.usage.outputTokens,
      totalTokens,
      cachedTokens,
      compressionSavedTokens,
      localTokens: routeClass === "local" ? nonCachedTokens : 0,
      freeTokens: routeClass === "free" ? nonCachedTokens : 0,
      paidTokens: routeClass === "paid" ? nonCachedTokens : 0,
      reportedCostUsd,
      avoidedPaidCostUsd,
    };
    await mkdir(dirname(this.ledgerPath), { recursive: true });
    await appendFile(this.ledgerPath, `${JSON.stringify(event)}\n`, "utf8");
    return event;
  }

  async summary(filter: { missionId?: string; since?: Date } = {}): Promise<ModelEconomicSummary> {
    const events = (await this.readEvents()).filter((event) =>
      (!filter.missionId || event.missionId === filter.missionId) &&
      (!filter.since || new Date(event.occurredAt).getTime() >= filter.since.getTime()),
    );
    return events.reduce<ModelEconomicSummary>((summary, event) => ({
      localTokens: summary.localTokens + event.localTokens,
      freeTokens: summary.freeTokens + event.freeTokens,
      paidTokens: summary.paidTokens + event.paidTokens,
      cachedTokens: summary.cachedTokens + event.cachedTokens,
      compressionSavedTokens: summary.compressionSavedTokens + event.compressionSavedTokens,
      reportedPaidCostUsd: summary.reportedPaidCostUsd + event.reportedCostUsd,
      avoidedPaidCostUsd: summary.avoidedPaidCostUsd + event.avoidedPaidCostUsd,
      totalModelTokens: summary.totalModelTokens + event.totalTokens,
      events: summary.events + 1,
    }), {
      localTokens: 0,
      freeTokens: 0,
      paidTokens: 0,
      cachedTokens: 0,
      compressionSavedTokens: 0,
      reportedPaidCostUsd: 0,
      avoidedPaidCostUsd: 0,
      totalModelTokens: 0,
      events: 0,
    });
  }

  private validatePolicy(policy: ModelEconomicPolicy): void {
    if (!["never", "ask", "allow"].includes(policy.paidEscalation)) {
      throw new Error("K.I.N.G.S. Model Economics: unsupported paid escalation mode");
    }
    for (const [scope, limit] of Object.entries({ mission: policy.mission, day: policy.day, month: policy.month })) {
      finiteNonNegative(limit?.maximumPaidCostUsd, `${scope}.maximumPaidCostUsd`);
      finiteNonNegative(limit?.maximumPaidTokens, `${scope}.maximumPaidTokens`);
    }
  }

  private exceeded(
    policy: ModelEconomicPolicy,
    projected: ModelEconomicAuthorizationDecision["projected"],
  ): string | undefined {
    const checks: Array<[number, number | undefined, string]> = [
      [projected.missionPaidCostUsd, policy.mission?.maximumPaidCostUsd, "Mission paid-dollar budget would be exceeded."],
      [projected.dayPaidCostUsd, policy.day?.maximumPaidCostUsd, "Daily paid-dollar budget would be exceeded."],
      [projected.monthPaidCostUsd, policy.month?.maximumPaidCostUsd, "Monthly paid-dollar budget would be exceeded."],
      [projected.missionPaidTokens, policy.mission?.maximumPaidTokens, "Mission paid-token budget would be exceeded."],
      [projected.dayPaidTokens, policy.day?.maximumPaidTokens, "Daily paid-token budget would be exceeded."],
      [projected.monthPaidTokens, policy.month?.maximumPaidTokens, "Monthly paid-token budget would be exceeded."],
    ];
    return checks.find(([value, limit]) => limit !== undefined && value > limit)?.[2];
  }

  private scopeUsage(events: ModelEconomicUsageEvent[], missionId: string, now: Date): {
    mission: { cost: number; tokens: number };
    day: { cost: number; tokens: number };
    month: { cost: number; tokens: number };
  } {
    const day = utcDay(now);
    const month = utcMonth(now);
    const zero = () => ({ cost: 0, tokens: 0 });
    const result = { mission: zero(), day: zero(), month: zero() };
    for (const event of events) {
      if (event.routeClass !== "paid") continue;
      if (event.missionId === missionId) {
        result.mission.cost += event.reportedCostUsd;
        result.mission.tokens += event.paidTokens;
      }
      const eventDate = new Date(event.occurredAt);
      if (utcDay(eventDate) === day) {
        result.day.cost += event.reportedCostUsd;
        result.day.tokens += event.paidTokens;
      }
      if (utcMonth(eventDate) === month) {
        result.month.cost += event.reportedCostUsd;
        result.month.tokens += event.paidTokens;
      }
    }
    return result;
  }

  private async readEvents(): Promise<ModelEconomicUsageEvent[]> {
    let raw: string;
    try {
      raw = await readFile(this.ledgerPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const events: ModelEconomicUsageEvent[] = [];
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      const parsed = JSON.parse(line) as ModelEconomicUsageEvent;
      if (!parsed.id || !parsed.missionId || !parsed.occurredAt) {
        throw new Error("K.I.N.G.S. Model Economics: corrupt durable ledger event");
      }
      events.push(parsed);
    }
    return events;
  }
}
