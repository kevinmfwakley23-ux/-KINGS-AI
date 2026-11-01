import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  OWNER_SESSION_TTL_SECONDS,
  issueOwnerSession,
  ownerSessionSetCookie,
  verifyOwnerSession,
} from "./owner-session.mjs";

const token = "kings-owner-test-token-0123456789abcdef";
const otherToken = "kings-rotated-test-token-0123456789abcdef";
const issuedAt = 1_800_000_000_000;
const first = issueOwnerSession(token, issuedAt);
const second = issueOwnerSession(token, issuedAt);
assert.notEqual(first, second, "each browser login needs a fresh random session identifier");
assert.equal(verifyOwnerSession(first, token, issuedAt), true);
assert.equal(verifyOwnerSession(first, token, issuedAt + (OWNER_SESSION_TTL_SECONDS - 1) * 1000), true);
assert.equal(verifyOwnerSession(first, token, issuedAt + OWNER_SESSION_TTL_SECONDS * 1000), false, "expired sessions must fail closed");
assert.equal(verifyOwnerSession(first, token, issuedAt - 61_000), false, "future-dated sessions must fail closed");
assert.equal(verifyOwnerSession(first, otherToken, issuedAt), false, "owner token rotation invalidates old sessions");
assert.equal(verifyOwnerSession(first.slice(0, -1) + (first.at(-1) === "A" ? "B" : "A"), token, issuedAt), false, "tampered signatures must fail");
assert.equal(verifyOwnerSession(first.replace("v1.", "v2."), token, issuedAt), false);
assert.equal(verifyOwnerSession(first + ".extra", token, issuedAt), false);
assert.equal(verifyOwnerSession("x".repeat(400), token, issuedAt), false);
assert.equal(verifyOwnerSession(createHash("sha256").update(`kings-owner-session:${token}`).digest("hex"), token, issuedAt), false, "legacy perpetual cookie must be rejected");
assert.equal(verifyOwnerSession(first, "", issuedAt), false);
assert.throws(() => issueOwnerSession("short", issuedAt), /at least 24/);
const cookie = ownerSessionSetCookie("__Host-kings_owner_access", token, issuedAt);
assert.match(cookie, /; Path=\/; Max-Age=43200; HttpOnly; Secure; SameSite=Strict$/);
assert.doesNotMatch(cookie, new RegExp(token));
assert.ok(cookie.startsWith("__Host-kings_owner_access=v1."));
console.log("K.I.N.G.S. expiring owner browser session contract: SUCCESS");
