
import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { AppAiRouteRequest } from "./app-ai-router";

export interface PaidAccount {
  id: string;
  keySha256: string;
  planId: string;
  status: "active" | "suspended";
  paidThrough: string;
  monthlyTokens: number;
  monthlyRequests: number;
  maxOutputTokens: number;
}

type Ledger = { version: 1; months: Record<string, { tokens: number; requests: number }> };
export type UsageSnapshot = {
  accountId: string;
  planId: string;
  period: string;
  monthlyTokens: number;
  monthlyRequests: number;
  usedTokens: number;
  usedRequests: number;
  remainingTokens: number;
  remainingRequests: number;
  maxOutputTokens: number;
};

export class UsageAccessError extends Error {
  constructor(readonly code: string, readonly statusCode: number, message: string) {
    super(message);
    this.name = "UsageAccessError";
  }
}

function positive(value: unknown, label: string, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > max) {
    throw new Error("K.I.N.G.S. Usage: invalid " + label);
  }
  return Number(value);
}

function loadAccounts(path: string): Map<string, PaidAccount> {
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("K.I.N.G.S. Usage: invalid manifest");
  const data = raw as { version?: unknown; accounts?: unknown };
  if (data.version !== 1 || !Array.isArray(data.accounts) || data.accounts.length > 10000) {
    throw new Error("K.I.N.G.S. Usage: expected version 1 and accounts array");
  }
  const hashes = new Map<string, PaidAccount>();
  const ids = new Set<string>();
  for (const item of data.accounts) {
    const row = item as PaidAccount;
    if (!row || typeof row !== "object" ||
      typeof row.id !== "string" || !/^[a-zA-Z0-9_-]{3,100}$/.test(row.id) ||
      typeof row.planId !== "string" || !/^[a-zA-Z0-9_-]{2,80}$/.test(row.planId) ||
      typeof row.keySha256 !== "string" || !/^[0-9a-f]{64}$/.test(row.keySha256) ||
      (row.status !== "active" && row.status !== "suspended") ||
      typeof row.paidThrough !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(row.paidThrough) ||
      !Number.isFinite(Date.parse(row.paidThrough))) {
      throw new Error("K.I.N.G.S. Usage: invalid account, key hash, status or expiry");
    }
    positive(row.monthlyTokens, "monthlyTokens");
    positive(row.monthlyRequests, "monthlyRequests");
    positive(row.maxOutputTokens, "maxOutputTokens", 65536);
    if (hashes.has(row.keySha256) || ids.has(row.id)) throw new Error("K.I.N.G.S. Usage: duplicate account/key");
    ids.add(row.id);
    hashes.set(row.keySha256, { ...row });
  }
  return hashes;
}

function readLedger(path: string): Ledger {
  if (!existsSync(path)) return { version: 1, months: Object.create(null) };
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("K.I.N.G.S. Usage: corrupt ledger");
  const data = raw as Ledger;
  if (data.version !== 1 || !data.months || typeof data.months !== "object" || Array.isArray(data.months)) {
    throw new Error("K.I.N.G.S. Usage: invalid ledger schema");
  }
  const months: Ledger["months"] = Object.create(null);
  for (const [key, value] of Object.entries(data.months)) {
    if (!/^[a-zA-Z0-9_-]{3,100}:\d{4}-\d{2}$/.test(key) ||
      !value || !Number.isSafeInteger(value.tokens) || value.tokens < 0 ||
      !Number.isSafeInteger(value.requests) || value.requests < 0) {
      throw new Error("K.I.N.G.S. Usage: invalid ledger entry");
    }
    months[key] = { ...value };
  }
  return { version: 1, months };
}

/**
 * One router process per ledger (enforced by an exclusive file lock).
 * A private, owner-approved entitlement manifest is reloaded on each request:
 * payments/upgrades and revocations take effect without a restart. The client
 * cannot set its own plan. This is metering, NOT a payment processor.
 */
export class MonthlyUsageAuthority {
  private readonly manifestPath: string;
  private readonly ledgerPath: string;
  private readonly lockPath: string;
  private readonly lockFd: number;
  private ledger: Ledger;
  private closed = false;

  constructor(manifestPath: string, ledgerPath: string) {
    this.manifestPath = resolve(manifestPath);
    this.ledgerPath = resolve(ledgerPath);
    this.lockPath = this.ledgerPath + ".lock";
    loadAccounts(this.manifestPath);
    mkdirSync(dirname(this.ledgerPath), { recursive: true, mode: 0o700 });
    this.lockFd = openSync(this.lockPath, "wx", 0o600);
    try { this.ledger = readLedger(this.ledgerPath); }
    catch (error) { closeSync(this.lockFd); unlinkSync(this.lockPath); throw error; }
  }

  static keyDigest(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private assertOpen(): void {
    if (this.closed) throw new UsageAccessError("USAGE_UNAVAILABLE", 503, "Usage authority is closed");
  }

  accountForToken(token: string): PaidAccount | undefined {
    this.assertOpen();
    return loadAccounts(this.manifestPath).get(MonthlyUsageAuthority.keyDigest(token));
  }

  private write(next: Ledger): void {
    this.assertOpen();
    const temp = this.ledgerPath + "." + randomUUID() + ".tmp";
    try {
      writeFileSync(temp, JSON.stringify(next), { mode: 0o600, flag: "wx" });
      renameSync(temp, this.ledgerPath);
    } finally {
      if (existsSync(temp)) unlinkSync(temp);
    }
    this.ledger = next;
  }

  snapshot(account: PaidAccount, now = new Date()): UsageSnapshot {
    this.assertOpen();
    if (account.status !== "active" || Date.parse(account.paidThrough) <= now.getTime()) {
      throw new UsageAccessError("SUBSCRIPTION_INACTIVE", 403, "Subscription inactive or expired");
    }
    const period = now.toISOString().slice(0, 7);
    const entry = this.ledger.months[account.id + ":" + period] ?? { tokens: 0, requests: 0 };
    return {
      accountId: account.id, planId: account.planId, period,
      monthlyTokens: account.monthlyTokens, monthlyRequests: account.monthlyRequests,
      usedTokens: entry.tokens, usedRequests: entry.requests,
      remainingTokens: Math.max(0, account.monthlyTokens - entry.tokens),
      remainingRequests: Math.max(0, account.monthlyRequests - entry.requests),
      maxOutputTokens: account.maxOutputTokens,
    };
  }

  reserve(account: PaidAccount, request: AppAiRouteRequest, now = new Date()): { finish(actualTokens?: number): void } {
    const current = this.snapshot(account, now);
    const maxOutput = request.maxOutputTokens ?? Math.min(2048, account.maxOutputTokens);
    if (!Number.isSafeInteger(maxOutput) || maxOutput < 1 || maxOutput > account.maxOutputTokens) {
      throw new UsageAccessError("PLAN_OUTPUT_CAP", 403, "Requested output exceeds plan limit");
    }
    const chars = Array.isArray(request.messages)
      ? request.messages.reduce((total, item) => total + (typeof item?.content === "string" ? item.content.length : 0), 0)
      : 0;
    // Conservative estimate, not a model-specific tokenizer. Actual usage is
    // charged after execution, including any input-token estimate overage.
    const hold = maxOutput + Math.ceil(chars / 3) + 128;
    if (!Number.isSafeInteger(hold) || hold > current.remainingTokens || current.remainingRequests < 1) {
      throw new UsageAccessError("MONTHLY_QUOTA_EXCEEDED", 429, "Monthly allowance exhausted");
    }
    const key = account.id + ":" + current.period;
    const old = this.ledger.months[key] ?? { tokens: 0, requests: 0 };
    this.write({ version: 1, months: { ...this.ledger.months,
      [key]: { tokens: old.tokens + hold, requests: old.requests + 1 } } });
    let settled = false;
    return {
      finish: (actualTokens?: number) => {
        if (settled) throw new Error("K.I.N.G.S. Usage: reservation already settled");
        this.assertOpen();
        const charged = actualTokens === undefined ? 0 : positive(actualTokens, "actualTokens");
        const last = this.ledger.months[key];
        if (!last) throw new Error("K.I.N.G.S. Usage: reservation disappeared");
        const tokens = last.tokens - hold + charged;
        const requests = last.requests - (actualTokens === undefined ? 1 : 0);
        if (!Number.isSafeInteger(tokens) || tokens < 0 || requests < 0) throw new Error("K.I.N.G.S. Usage: ledger overflow");
        this.write({ version: 1, months: { ...this.ledger.months, [key]: { tokens, requests } } });
        settled = true;
      },
    };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    closeSync(this.lockFd);
    unlinkSync(this.lockPath);
  }
}
