import type { AppAiRouteRequest } from "./app-ai-router";
import type { IntelligenceCapability, ModelRequestMessage } from "./model-interface";

export const POWERHOUSE_DOMAIN_POLICY_VERSION = "2026-10-24.v1";

export type PowerhouseServiceDomain =
  | "chat"
  | "coding"
  | "collectibles"
  | "sports-cards"
  | "book-editing"
  | "publishing"
  | "storytelling";

export interface PowerhouseServiceDomainProfile {
  id: PowerhouseServiceDomain;
  label: string;
  requiredCapabilities: readonly IntelligenceCapability[];
  maximumTemperature: number;
  instruction: string;
}

export class PowerhouseServiceDomainError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "PowerhouseServiceDomainError";
  }
}

const PROFILES: readonly PowerhouseServiceDomainProfile[] = [
  {
    id: "chat",
    label: "General Chat",
    requiredCapabilities: ["reasoning"],
    maximumTemperature: 1,
    instruction: [
      "Answer the user directly and clearly.",
      "Separate known facts from inference and say when current or external evidence is required.",
      "Do not claim that a model, tool, search, file, or action was used unless the runtime supplied that evidence.",
    ].join(" "),
  },
  {
    id: "coding",
    label: "Software Engineering",
    requiredCapabilities: ["reasoning", "coding", "debugging", "verification", "recovery"],
    maximumTemperature: 0.2,
    instruction: [
      "Produce concrete software-engineering work grounded in the supplied repository evidence.",
      "Preserve security and authorization boundaries, prefer the smallest coherent change, and distinguish proposed code from executed code.",
      "Never claim a build or test passed unless execution evidence is present.",
    ].join(" "),
  },
  {
    id: "collectibles",
    label: "Collectibles Analysis",
    requiredCapabilities: ["reasoning", "research", "verification"],
    maximumTemperature: 0.2,
    instruction: [
      "Analyze collectibles from supplied observations and attributable market evidence.",
      "Separate identification, condition observations, authentication, grading, and valuation; never present an image estimate as an official grade or guarantee.",
      "State missing evidence and preserve source dates, sale type, currency, and uncertainty when available.",
    ].join(" "),
  },
  {
    id: "sports-cards",
    label: "Sports and Trading Cards",
    requiredCapabilities: ["reasoning", "research", "verification"],
    maximumTemperature: 0.2,
    instruction: [
      "Analyze sports and trading cards using exact set, year, manufacturer, player or character, card number, parallel, language, condition, and grading details when supplied.",
      "Use comparable completed sales rather than asking prices when valuation evidence exists, and never invent a certification, population count, sale, or official grade.",
    ].join(" "),
  },
  {
    id: "book-editing",
    label: "Book Editing",
    requiredCapabilities: ["reasoning", "long-context", "memory"],
    maximumTemperature: 0.5,
    instruction: [
      "Edit while preserving the author's intent, voice, canon, point of view, and requested audience.",
      "Distinguish corrections from optional rewrites, identify continuity risks, and do not silently add facts or overwrite locked canon.",
    ].join(" "),
  },
  {
    id: "publishing",
    label: "Book Publishing",
    requiredCapabilities: ["reasoning", "research", "verification", "long-context"],
    maximumTemperature: 0.2,
    instruction: [
      "Provide publication guidance with explicit assumptions, platform and edition context, and dated source support for rules that may change.",
      "Do not claim submission, approval, distribution, sales, legal compliance, or account access without direct runtime evidence.",
    ].join(" "),
  },
  {
    id: "storytelling",
    label: "Story Writing",
    requiredCapabilities: ["reasoning", "long-context", "memory"],
    maximumTemperature: 1.2,
    instruction: [
      "Write vivid, coherent narrative that follows the supplied genre, audience, voice, structure, canon, and continuity constraints.",
      "Treat locked story facts as authoritative, avoid unrequested canon changes, and flag genuine contradictions instead of silently resolving them.",
    ].join(" "),
  },
] as const;

const PROFILE_BY_ID = new Map(PROFILES.map((profile) => [profile.id, profile]));

export function listPowerhouseServiceDomains(): PowerhouseServiceDomainProfile[] {
  return PROFILES.map((profile) => ({
    ...profile,
    requiredCapabilities: [...profile.requiredCapabilities],
  }));
}

export function resolvePowerhouseServiceDomain(value: unknown): PowerhouseServiceDomainProfile {
  if (typeof value !== "string" || !value.trim()) {
    throw new PowerhouseServiceDomainError(
      "INVALID_SERVICE_DOMAIN",
      "service_domain must be one of the registered K.I.N.G.S. Powerhouse service domains.",
    );
  }
  const id = value.trim().toLowerCase() as PowerhouseServiceDomain;
  const profile = PROFILE_BY_ID.get(id);
  if (!profile) {
    throw new PowerhouseServiceDomainError(
      "INVALID_SERVICE_DOMAIN",
      `Unsupported service_domain "${value}".`,
    );
  }
  return {
    ...profile,
    requiredCapabilities: [...profile.requiredCapabilities],
  };
}

export function applyPowerhouseServiceDomain(
  request: AppAiRouteRequest,
  profile: PowerhouseServiceDomainProfile,
): AppAiRouteRequest {
  const policyMessage: ModelRequestMessage = {
    role: "system",
    content: [
      `K.I.N.G.S. POWERHOUSE SERVICE DOMAIN: ${profile.label} (${profile.id})`,
      `DOMAIN POLICY VERSION: ${POWERHOUSE_DOMAIN_POLICY_VERSION}`,
      "This routing policy does not by itself prove expert capability; answer quality must still pass domain evaluation.",
      profile.instruction,
    ].join("\n"),
  };
  const requestedTemperature = request.temperature ?? profile.maximumTemperature;
  return {
    ...request,
    messages: [policyMessage, ...request.messages.map((message) => ({ ...message }))],
    requiredCapabilities: [...profile.requiredCapabilities],
    temperature: Math.min(requestedTemperature, profile.maximumTemperature),
    allowToolProposals: false,
  };
}
