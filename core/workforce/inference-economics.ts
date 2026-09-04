import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

export type InferenceRouteClass = "local" | "free" | "paid" | "unknown";
export type PaidEscalationMode = "deny" | "ask" | "allow";

export interface InferenceEconomicsObservation {
  requestId: string;
  missionId: string;
  providerId: string;
  modelId: string;
  completedAt: string;
  routeClass: InferenceRouteClass;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalTokens: number;
  paidTokens: number;
  actualCostUsd?: number;
  avoidedCostUsd?: number;
}

export interface InferenceBudgetPolicy {
  missionUsd?: number;
  dayUsd?: number;
  monthUsd?: number;
  missionPaidTokens?: number;
  dayPaidTokens?: number;
  monthPaidTokens?: number;
  paidEscalation: PaidEscalationMode;
}

export interface InferenceSpendProposal {
  missionId: string;
  providerId: string;
  modelId: string;
  routeClass: InferenceRouteClass;
  estimatedCostUsd?: number;
  estimatedPaidTokens?: number;
  approvedPaidEscalation?: boolean;
  at?: string;
}

export interface InferenceBudgetDecision {
  status: "allowed" | "approval-required" | "denied";
  reason: string;
  projected: {
    missionUsd: number;
    dayUsd: number;
    monthUsd: number;
    missionPaidTokens: number;
    dayPaidTokens: number;
    monthPaidTokens: number;
  };
}

export interface InferenceEconomicsSummary {
  requests: number;
  localTokens: number;
  freeTokens: number;
  paidTokens: number;
  unknownRouteTokens: number;
  cachedTokens: number;
  actualCostUsd: number;
  avoidedCostUsd: number;
  totalTokens: number;
  tokensAvoidingPaidRoutes: number;
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function validateObservation(value: InferenceEconomicsObservation): void {
  for (const field of ["requestId", "missionId", "providerId", "modelId"] as const) {
    if (!value[field].trim()) {
      throw new Error(`K.I.N.G.S. Inference Economics: ${field} is required.`);
    }
  }
  if (!Number.isFinite(Date.parse(value.completedAt))) {
    throw new Error("K.I.N.G.S. Inference Economics: completedAt must be a valid timestamp.");
  }
  for (const [name, amount] of [
    ["inputTokens", value.inputTokens],
    ["outputTokens", value.outputTokens],
    ["cachedTokens", value.cachedTokens],
    ["totalTokens", value.totalTokens],
    ["paidTokens", value.paidTokens],
  ] as const) {
    if (!finiteNonNegative(amount)) {
      throw new Error(`K.I.N.G.S. Inference Economics: ${name} must be finite and non-negative.`);
    }
  }
  if (value.totalTokens < value.inputTokens + value.outputTokens) {
    throw new Error("K.I.N.G.S. Inference Economics: totalTokens cannot be below input + output tokens.");
  }
  if (value.paidTokens > value.totalTokens) {
    throw new Error("K.I.N.G.S. Inference Economics: paidTokens cannot exceed totalTokens.");
  }
  if (value.routeClass !== "paid" && value.paidTokens !== 0) {
    throw new Error("K.I.N.G.S. Inference Economics: only paid routes may report paidTokens.");
  }
  for (const [name, amount] of [
    ["actualCostUsd", value.actualCostUsd],
    ["avoidedCostUsd", value.avoidedCostUsd],
  ] as const) {
    if (amount !== undefined && !finiteNonNegative(amount)) {
      throw new Error(`K.I.N.G.S. Inference Economics: ${name} must be finite and non-negative when supplied.`);
    }
  }
}

function validateLimit(name: string, value: number | undefined): void {
  if (value !== undefined && !finiteNonNegative(value)) {
    throw new Error(`K.I.N.G.S. Inference Budget: ${name} must be finite and non-negative.`);
  }
}

function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utcMonthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

export class DurableInferenceEconomicsLedger {
  private writeTail: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async record(observation: InferenceEconomicsObservation): Promise<void> {
    validateObservation(observation);
    const write = this.writeTail
      .catch(() => undefined)
      .then(async () => {
        await mkdir(dirname(this.filePath), { recursive: true });
        await appendFile(this.filePath, `${JSON.stringify(observation)}\n`, "utf8");
      });
    this.writeTail = write;
    await write;
  }

  async list(): Promise<InferenceEconomicsObservation[]> {
    await this.writeTail.catch(() => undefined);
    let text: string;
    try {
      text = await readFile(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const records: InferenceEconomicsObservation[] = [];
    for (const [index, line] of text.split("\n").entries()) {
      if (!line.trim()) continue;
      let parsed: InferenceEconomicsObservation;
      try {
        parsed = JSON.parse(line) as InferenceEconomicsObservation;
      } catch (error) {
        throw new Error(
          `K.I.N.G.S. Inference Economics: ledger line ${index + 1} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      validateObservation(parsed);
      records.push(parsed);
    }
    return records;
  }

  async summarize(missionId?: string): Promise<InferenceEconomicsSummary> {
    const records = (await this.list()).filter((record) =>
      missionId === undefined || record.missionId === missionId,
    );
    const summary: InferenceEconomicsSummary = {
      requests: 0,
      localTokens: 0,
      freeTokens: 0,
      paidTokens: 0,
      unknownRouteTokens: 0,
      cachedTokens: 0,
      actualCostUsd: 0,
      avoidedCostUsd: 0,
      totalTokens: 0,
      tokensAvoidingPaidRoutes: 0,
    };
    for (const record of records) {
      summary.requests += 1;
      summary.totalTokens += record.totalTokens;
      summary.cachedTokens += record.cachedTokens;
      summary.actualCostUsd += record.actualCostUsd ?? 0;
      summary.avoidedCostUsd += record.avoidedCostUsd ?? 0;
      if (record.routeClass === "local") {
        summary.localTokens += record.totalTokens;
        summary.tokensAvoidingPaidRoutes += record.totalTokens;
      } else if (record.routeClass === "free") {
        summary.freeTokens += record.totalTokens;
        summary.tokensAvoidingPaidRoutes += record.totalTokens;
      } else if (record.routeClass === "paid") {
        summary.paidTokens += record.paidTokens;
      } else {
        summary.unknownRouteTokens += record.totalTokens;
      }
    }
    return summary;
  }
}

export class InferenceBudgetAuthority {
  constructor(
    private readonly ledger: DurableInferenceEconomicsLedger,
    private readonly policy: InferenceBudgetPolicy,
  ) {
    validateLimit("missionUsd", policy.missionUsd);
    validateLimit("dayUsd", policy.dayUsd);
    validateLimit("monthUsd", policy.monthUsd);
    validateLimit("missionPaidTokens", policy.missionPaidTokens);
    validateLimit("dayPaidTokens", policy.dayPaidTokens);
    validateLimit("monthPaidTokens", policy.monthPaidTokens);
  }

  async assess(proposal: InferenceSpendProposal): Promise<InferenceBudgetDecision> {
    if (!proposal.missionId.trim() || !proposal.providerId.trim() || !proposal.modelId.trim()) {
      throw new Error("K.I.N.G.S. Inference Budget: mission, provider, and model ids are required.");
    }
    const paid = proposal.routeClass === "paid";
    if (paid && proposal.estimatedCostUsd === undefined) {
      return {
        status: this.policy.paidEscalation === "allow" && proposal.approvedPaidEscalation
          ? "allowed"
          : this.policy.paidEscalation === "deny"
            ? "denied"
            : "approval-required",
        reason:
          "Paid route cost is unknown. K.I.N.G.S. will not silently treat unknown paid pricing as affordable.",
        projected: await this.projected(proposal, 0, proposal.estimatedPaidTokens ?? 0),
      };
    }
    if (proposal.estimatedCostUsd !== undefined) validateLimit("estimatedCostUsd", proposal.estimatedCostUsd);
    if (proposal.estimatedPaidTokens !== undefined) validateLimit("estimatedPaidTokens", proposal.estimatedPaidTokens);

    if (paid && !proposal.approvedPaidEscalation) {
      if (this.policy.paidEscalation === "deny") {
        return {
          status: "denied",
          reason: "Owner policy denies paid inference escalation.",
          projected: await this.projected(
            proposal,
            proposal.estimatedCostUsd ?? 0,
            proposal.estimatedPaidTokens ?? 0,
          ),
        };
      }
      if (this.policy.paidEscalation === "ask") {
        return {
          status: "approval-required",
          reason: "Owner approval is required before K.I.N.G.S. crosses from local/free inference into a paid route.",
          projected: await this.projected(
            proposal,
            proposal.estimatedCostUsd ?? 0,
            proposal.estimatedPaidTokens ?? 0,
          ),
        };
      }
    }

    const projected = await this.projected(
      proposal,
      paid ? proposal.estimatedCostUsd ?? 0 : 0,
      paid ? proposal.estimatedPaidTokens ?? 0 : 0,
    );
    const checks: Array<[keyof InferenceBudgetDecision["projected"], number | undefined]> = [
      ["missionUsd", this.policy.missionUsd],
      ["dayUsd", this.policy.dayUsd],
      ["monthUsd", this.policy.monthUsd],
      ["missionPaidTokens", this.policy.missionPaidTokens],
      ["dayPaidTokens", this.policy.dayPaidTokens],
      ["monthPaidTokens", this.policy.monthPaidTokens],
    ];
    for (const [key, limit] of checks) {
      if (limit !== undefined && projected[key] > limit) {
        return {
          status: "denied",
          reason: `Hard inference budget ${key} would be exceeded (${projected[key]} > ${limit}).`,
          projected,
        };
      }
    }
    return {
      status: "allowed",
      reason: paid
        ? "Paid inference is within hard budgets and satisfies owner escalation policy."
        : "Local/free inference does not consume paid-route dollar or paid-token budgets.",
      projected,
    };
  }

  private async projected(
    proposal: InferenceSpendProposal,
    proposedUsd: number,
    proposedPaidTokens: number,
  ): Promise<InferenceBudgetDecision["projected"]> {
    const at = new Date(proposal.at ?? new Date().toISOString());
    if (!Number.isFinite(at.getTime())) {
      throw new Error("K.I.N.G.S. Inference Budget: proposal time is invalid.");
    }
    const records = await this.ledger.list();
    let missionUsd = 0;
    let dayUsd = 0;
    let monthUsd = 0;
    let missionPaidTokens = 0;
    let dayPaidTokens = 0;
    let monthPaidTokens = 0;
    for (const record of records) {
      const completed = new Date(record.completedAt);
      const usd = record.actualCostUsd ?? 0;
      if (record.missionId === proposal.missionId) {
        missionUsd += usd;
        missionPaidTokens += record.paidTokens;
      }
      if (utcDayKey(completed) === utcDayKey(at)) {
        dayUsd += usd;
        dayPaidTokens += record.paidTokens;
      }
      if (utcMonthKey(completed) === utcMonthKey(at)) {
        monthUsd += usd;
        monthPaidTokens += record.paidTokens;
      }
    }
    return {
      missionUsd: missionUsd + proposedUsd,
      dayUsd: dayUsd + proposedUsd,
      monthUsd: monthUsd + proposedUsd,
      missionPaidTokens: missionPaidTokens + proposedPaidTokens,
      dayPaidTokens: dayPaidTokens + proposedPaidTokens,
      monthPaidTokens: monthPaidTokens + proposedPaidTokens,
    };
  }
}
