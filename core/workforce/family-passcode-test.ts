import assert from "node:assert/strict";
import { test } from "node:test";
import { digestFamilyPasscode, issueFamilyPasscode, redeemFamilyPasscode, validateFamilyInvitations } from "./family-passcode";

test("family passcodes are unique, high entropy, and never the owner token", () => {
  const first = issueFamilyPasscode();
  const second = issueFamilyPasscode();
  assert.notEqual(first, second);
  assert.match(first, /^kings_family_[A-Za-z0-9_-]{43}$/);
  assert.notEqual(digestFamilyPasscode(first), first);
  assert.throws(() => digestFamilyPasscode("1234"));
});

test("valid invitation works until revoked or expired", () => {
  const token = issueFamilyPasscode();
  const invitation = { id: "family_one", digest: digestFamilyPasscode(token), status: "active" as const, expiresAt: "2030-01-01T00:00:00Z" };
  assert.equal(redeemFamilyPasscode(token, [invitation], new Date("2026-11-07T00:00:00Z")), "family_one");
  assert.equal(redeemFamilyPasscode("invalid", [invitation]), undefined);
  assert.equal(redeemFamilyPasscode(token, [{ ...invitation, status: "revoked" }]), undefined);
  assert.equal(redeemFamilyPasscode(token, [invitation], new Date("2030-01-01T00:00:00Z")), undefined);
});

test("manifest rejects duplicate credentials and malformed rows", () => {
  const invitation = { id: "family_one", digest: digestFamilyPasscode(issueFamilyPasscode()), status: "active" as const, expiresAt: "2030-01-01T00:00:00Z" };
  assert.throws(() => validateFamilyInvitations([invitation, invitation]));
  assert.throws(() => validateFamilyInvitations([{ ...invitation, digest: "bad" }]));
});
