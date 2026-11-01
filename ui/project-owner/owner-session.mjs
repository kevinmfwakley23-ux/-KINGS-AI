import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Short-lived, stateless browser sessions. The owner master token never enters
// a cookie, and rotating it invalidates all previously issued sessions.
export const OWNER_SESSION_TTL_SECONDS = 12 * 60 * 60;
const CLOCK_SKEW_SECONDS = 60;
const COOKIE_PATTERN = /^v1\.([1-9]\d{0,11})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/u;

function signingKey(ownerToken) {
  if (typeof ownerToken !== "string" || ownerToken.length < 24) {
    throw new TypeError("A configured owner token of at least 24 characters is required.");
  }
  return createHmac("sha256", ownerToken).update("kings-owner-session-signing:v1").digest();
}

export function issueOwnerSession(ownerToken, nowMs = Date.now()) {
  if (!Number.isSafeInteger(nowMs) || nowMs <= 0) throw new RangeError("Invalid session issuance time.");
  const issuedAt = Math.floor(nowMs / 1000);
  const payload = `v1.${issuedAt}.${randomBytes(16).toString("base64url")}`;
  const signature = createHmac("sha256", signingKey(ownerToken)).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyOwnerSession(value, ownerToken, nowMs = Date.now()) {
  if (typeof value !== "string" || value.length > 160 || !Number.isSafeInteger(nowMs) || nowMs <= 0) {
    return false;
  }
  const match = COOKIE_PATTERN.exec(value);
  if (!match) return false;
  const issuedAt = Number(match[1]);
  const nowSeconds = Math.floor(nowMs / 1000);
  if (!Number.isSafeInteger(issuedAt) || issuedAt > nowSeconds + CLOCK_SKEW_SECONDS ||
      nowSeconds - issuedAt >= OWNER_SESSION_TTL_SECONDS) return false;
  const supplied = Buffer.from(match[3], "base64url");
  if (supplied.length !== 32) return false;
  const payload = `v1.${match[1]}.${match[2]}`;
  try {
    const expected = createHmac("sha256", signingKey(ownerToken)).update(payload).digest();
    return timingSafeEqual(supplied, expected);
  } catch {
    return false;
  }
}

export function ownerSessionSetCookie(name, ownerToken, nowMs = Date.now()) {
  return `${name}=${issueOwnerSession(ownerToken, nowMs)}; Path=/; Max-Age=${OWNER_SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}
