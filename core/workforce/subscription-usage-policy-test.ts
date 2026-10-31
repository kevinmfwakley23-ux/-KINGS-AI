import { strict as assert } from "node:assert";
import { checkMonthlyUsage, type VerifiedEntitlement } from "./subscription-usage-policy";
const period = { periodStart: "2026-10-01T00:00:00Z", periodEnd: "2026-11-01T00:00:00Z" };
const user: VerifiedEntitlement = {
  subjectId: "subscriber-1", plan: "starter", active: true,
  ...period, monthlyTokenLimit: 1000, monthlyRequestLimit: 3, ownerVerified: false,
};
const now = new Date("2026-10-15T00:00:00Z");
assert.deepEqual(checkMonthlyUsage(user, { tokens: 900, requests: 2 }, 100, now),
  { allowed: true, reason: "allowed", remainingTokens: 100, remainingRequests: 1 });
assert.equal(checkMonthlyUsage(user, { tokens: 900, requests: 2 }, 101, now).reason, "token_limit");
assert.equal(checkMonthlyUsage(user, { tokens: 900, requests: 3 }, 1, now).reason, "request_limit");
assert.equal(checkMonthlyUsage({ ...user, active: false }, { tokens: 0, requests: 0 }, 1, now).reason, "inactive");
assert.equal(checkMonthlyUsage(user, { tokens: 0, requests: 0 }, 1, new Date("2026-11-01T00:00:00Z")).reason, "period_expired");
const owner: VerifiedEntitlement = { ...user, ownerVerified: true, active: false };
assert.deepEqual(checkMonthlyUsage(owner, { tokens: 100000, requests: 100000 }, 50000, now),
  { allowed: true, reason: "allowed", remainingTokens: null, remainingRequests: null });
assert.throws(() => checkMonthlyUsage(user, { tokens: -1, requests: 0 }, 1, now));
assert.throws(() => checkMonthlyUsage(user, { tokens: 0, requests: 0 }, 0, now));
assert.throws(() => checkMonthlyUsage({ ...user, periodEnd: user.periodStart }, { tokens: 0, requests: 0 }, 1, now));
console.log("K.I.N.G.S. subscription usage policy: SUCCESS");
