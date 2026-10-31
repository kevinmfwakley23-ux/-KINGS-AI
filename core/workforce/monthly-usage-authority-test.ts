
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MonthlyUsageAuthority, UsageAccessError } from "./monthly-usage-authority";

const root = mkdtempSync(join(tmpdir(), "kings-monthly-usage-"));
const manifest = join(root, "private-accounts.json");
const ledger = join(root, "private-ledger.json");
const token = randomBytes(32).toString("hex");
const hash = MonthlyUsageAuthority.keyDigest(token);
const account = {
  id: "subscriber_one", keySha256: hash, planId: "standard",
  status: "active", paidThrough: "2099-12-31T23:59:59Z",
  monthlyTokens: 1200, monthlyRequests: 2, maxOutputTokens: 300,
} as const;
const writePlan = (patch: Record<string, unknown> = {}) => {
  writeFileSync(manifest, JSON.stringify({ version: 1, accounts: [{ ...account, ...patch }] }));
};
const request = {
  appId: "kings.ai", messages: [{ role: "user" as const, content: "collectible identifier" }],
  maxOutputTokens: 300,
};

try {
  writePlan();
  let authority = new MonthlyUsageAuthority(manifest, ledger);
  try {
    assert.equal(authority.accountForToken("wrong"), undefined);
    const user = authority.accountForToken(token);
    assert.ok(user);
    assert.equal(authority.snapshot(user).remainingRequests, 2);
    const first = authority.reserve(user, request);
    assert.equal(authority.snapshot(user).remainingRequests, 1);
    assert.throws(() => new MonthlyUsageAuthority(manifest, ledger), /EEXIST/, "second process must not share ledger");
    first.finish(120);
    assert.deepEqual(
      { tokens: authority.snapshot(user).usedTokens, requests: authority.snapshot(user).usedRequests },
      { tokens: 120, requests: 1 },
      "charge actual provider usage instead of the reserved estimate",
    );
    assert.throws(() => first.finish(2), /already settled/);
    const failed = authority.reserve(user, request);
    failed.finish();
    assert.equal(authority.snapshot(user).usedRequests, 1, "failed provider call releases reservation");
    const second = authority.reserve(user, request);
    second.finish(100);
    assert.equal(authority.snapshot(user).remainingRequests, 0);
    assert.throws(() => authority.reserve(user, request), (e) =>
      e instanceof UsageAccessError && e.code === "MONTHLY_QUOTA_EXCEEDED");

    writePlan({ planId: "premium", monthlyTokens: 5000, monthlyRequests: 10, maxOutputTokens: 400 });
    const upgraded = authority.accountForToken(token);
    assert.ok(upgraded);
    assert.equal(upgraded.planId, "premium", "owner plan upgrade takes effect immediately");
    assert.equal(authority.snapshot(upgraded).usedTokens, 220, "upgrades cannot reset accumulated monthly usage");
    assert.throws(() => authority.reserve(upgraded, { ...request, maxOutputTokens: 401 }),
      (e) => e instanceof UsageAccessError && e.code === "PLAN_OUTPUT_CAP");
    const upgradedCall = authority.reserve(upgraded, { ...request, maxOutputTokens: 400 });
    upgradedCall.finish(80);
    assert.equal(authority.snapshot(upgraded).usedTokens, 300);

    writePlan({ status: "suspended" });
    const suspended = authority.accountForToken(token);
    assert.ok(suspended);
    assert.throws(() => authority.snapshot(suspended),
      (e) => e instanceof UsageAccessError && e.code === "SUBSCRIPTION_INACTIVE");
    writePlan({ paidThrough: "2020-01-01T00:00:00Z" });
    const expired = authority.accountForToken(token);
    assert.ok(expired);
    assert.throws(() => authority.snapshot(expired),
      (e) => e instanceof UsageAccessError && e.code === "SUBSCRIPTION_INACTIVE");

    writePlan({ paidThrough: "2099-12-31T23:59:59Z", planId: "premium",
      monthlyTokens: 5000, monthlyRequests: 10, maxOutputTokens: 400 });
    assert.equal(authority.snapshot(authority.accountForToken(token)!).usedTokens, 300);
    const recentMonth = new Date("2026-10-30T00:00:00Z");
    const nextMonth = new Date("2026-11-01T00:00:00Z");
    const u = authority.accountForToken(token)!;
    const october = authority.reserve(u, request, recentMonth);
    october.finish(10);
    assert.equal(authority.snapshot(u, nextMonth).usedTokens, 0, "new UTC month starts a fresh allowance");

    const pending = authority.reserve(u, request, nextMonth);
    assert.ok(pending);
    assert.equal(authority.snapshot(u, nextMonth).usedRequests, 1);
  } finally {
    authority.close();
  }
  authority = new MonthlyUsageAuthority(manifest, ledger);
  try {
    assert.equal(authority.snapshot(authority.accountForToken(token)!, new Date("2026-11-01")).usedRequests, 1,
      "crashed or unresolved reservations remain consumed after process restart");
    const saved = JSON.parse(readFileSync(ledger, "utf8"));
    assert.equal(saved.version, 1);
    writeFileSync(manifest, "{broken json");
    assert.throws(() => authority.accountForToken(token), SyntaxError, "invalid billing manifest fails closed");
  } finally {
    authority.close();
  }
  console.log("K.I.N.G.S. monthly paid-user ledger: PASS");
} finally {
  rmSync(root, { recursive: true, force: true });
}
