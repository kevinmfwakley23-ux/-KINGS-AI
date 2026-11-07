import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Owner-issued family invitations are distinct from the private owner router token.
 * Only random, high-entropy invitations are supported; never accept short PINs.
 * Persist only SHA-256 digests in a private, owner-controlled manifest.
 */
export interface FamilyInvitation {
  id: string;
  digest: string;
  status: "active" | "revoked";
  expiresAt: string;
}

export function issueFamilyPasscode(): string {
  return "kings_family_" + randomBytes(32).toString("base64url");
}

export function digestFamilyPasscode(passcode: string): string {
  if (typeof passcode !== "string" || !/^kings_family_[A-Za-z0-9_-]{43}$/.test(passcode)) {
    throw new Error("Invalid family invitation format");
  }
  return createHash("sha256").update(passcode, "utf8").digest("hex");
}

export function validateFamilyInvitations(rows: readonly FamilyInvitation[]): void {
  if (!Array.isArray(rows) || rows.length > 1000) throw new Error("Invalid family invitation manifest");
  const ids = new Set<string>();
  const digests = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row.id !== "string" || !/^[a-zA-Z0-9_-]{3,100}$/.test(row.id) ||
      typeof row.digest !== "string" || !/^[a-f0-9]{64}$/.test(row.digest) ||
      (row.status !== "active" && row.status !== "revoked") ||
      typeof row.expiresAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(row.expiresAt) ||
      !Number.isFinite(Date.parse(row.expiresAt)) ||
      ids.has(row.id) || digests.has(row.digest)) {
      throw new Error("Invalid or duplicate family invitation");
    }
    ids.add(row.id);
    digests.add(row.digest);
  }
}

export function redeemFamilyPasscode(
  passcode: string,
  invitations: readonly FamilyInvitation[],
  now: Date = new Date(),
): string | undefined {
  validateFamilyInvitations(invitations);
  let digest: string;
  try { digest = digestFamilyPasscode(passcode); }
  catch { return undefined; }
  const candidate = Buffer.from(digest, "hex");
  let matched: string | undefined;
  for (const row of invitations) {
    const same = timingSafeEqual(candidate, Buffer.from(row.digest, "hex"));
    if (same && row.status === "active" && Date.parse(row.expiresAt) > now.getTime()) matched = row.id;
  }
  return matched;
}
