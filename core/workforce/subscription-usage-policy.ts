/** Owner-controlled monthly usage entitlements. Billing providers must supply
 * verified payment state; never trust plan names or owner flags from clients. */
export type PlanId = "free" | "starter" | "pro" | "business";
export interface VerifiedEntitlement {
  subjectId: string;
  plan: PlanId;
  active: boolean;
  periodStart: string;
  periodEnd: string;
  monthlyTokenLimit: number;
  monthlyRequestLimit: number;
  ownerVerified: boolean;
}
export interface UsageSnapshot {
  tokens: number;
  requests: number;
}
export interface UsageDecision {
  allowed: boolean;
  reason: "allowed" | "inactive" | "period_expired" | "token_limit" | "request_limit";
  remainingTokens: number | null;
  remainingRequests: number | null;
}
function validCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}
/** This pure gate must be called inside an atomic usage reservation transaction.
 * It does not charge payments or mutate a ledger. */
export function checkMonthlyUsage(
  entitlement: VerifiedEntitlement,
  usage: UsageSnapshot,
  requestedTokens: number,
  now: Date,
): UsageDecision {
  if (!validCount(requestedTokens) || requestedTokens === 0 ||
      !validCount(usage.tokens) || !validCount(usage.requests) ||
      !validCount(entitlement.monthlyTokenLimit) ||
      !validCount(entitlement.monthlyRequestLimit)) {
    throw new Error("Usage amounts and plan limits must be nonnegative safe integers; requested tokens must be positive");
  }
  const start = Date.parse(entitlement.periodStart);
  const end = Date.parse(entitlement.periodEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end ||
      !Number.isFinite(now.getTime())) throw new Error("Invalid entitlement billing period");
  const owner = entitlement.ownerVerified === true;
  const remainingTokens = owner ? null : Math.max(0, entitlement.monthlyTokenLimit - usage.tokens);
  const remainingRequests = owner ? null : Math.max(0, entitlement.monthlyRequestLimit - usage.requests);
  const result = (allowed: boolean, reason: UsageDecision["reason"]): UsageDecision =>
    ({ allowed, reason, remainingTokens, remainingRequests });
  if (!entitlement.active && !owner) return result(false, "inactive");
  if (now.getTime() < start || now.getTime() >= end) return result(false, "period_expired");
  if (owner) return result(true, "allowed");
  if (requestedTokens > remainingTokens!) return result(false, "token_limit");
  if (remainingRequests === 0) return result(false, "request_limit");
  return result(true, "allowed");
}
