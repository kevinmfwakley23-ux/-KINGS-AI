import { strict as assert } from "node:assert";
import type { IncomingMessage } from "node:http";
import {
  authorizePairingToken,
  createOwnerHttpAuthState,
  isLoopbackBindHost,
  isOwnerRequestAuthorized,
  ownerPairingCookieHeaders,
  pairingPathFromUrl,
  pairingTokenFromUrl,
  protectedApiPath,
} from "../../ui/project-owner/owner-http-auth";

function request(headers: Record<string, string> = {}): IncomingMessage {
  return { headers } as unknown as IncomingMessage;
}

function main(): void {
  assert.equal(isLoopbackBindHost("127.0.0.1"), true);
  assert.equal(isLoopbackBindHost("localhost"), true);
  assert.equal(isLoopbackBindHost("0.0.0.0"), false);

  const local = createOwnerHttpAuthState({ bindHost: "127.0.0.1" });
  assert.equal(local.required, false);
  assert.equal(isOwnerRequestAuthorized(request(), local), true);

  assert.throws(
    () => createOwnerHttpAuthState({ bindHost: "0.0.0.0" }),
    /requires KINGS_OWNER_TOKEN/,
    "LAN exposure must fail closed without an owner token",
  );
  assert.throws(
    () => createOwnerHttpAuthState({ bindHost: "0.0.0.0", token: "short" }),
    /at least 24 characters/,
    "weak LAN owner token must be rejected",
  );

  const token = "owner-token-abcdefghijklmnopqrstuvwxyz012345";
  const lan = createOwnerHttpAuthState({ bindHost: "0.0.0.0", token });
  assert.equal(lan.required, true);
  assert.equal(isOwnerRequestAuthorized(request(), lan), false);
  assert.equal(
    isOwnerRequestAuthorized(request({ authorization: `Bearer ${token}` }), lan),
    true,
  );
  assert.equal(
    isOwnerRequestAuthorized(request({ "x-kings-owner-token": token }), lan),
    true,
  );
  assert.equal(
    isOwnerRequestAuthorized(request({ cookie: `other=1; kings_owner_token=${encodeURIComponent(token)}` }), lan),
    true,
  );
  assert.equal(
    isOwnerRequestAuthorized(request({ authorization: "Bearer wrong-token-abcdefghijklmnopqrstuvwxyz" }), lan),
    false,
  );

  const pairedUrl = `/?token=${encodeURIComponent(token)}`;
  assert.equal(pairingTokenFromUrl(pairedUrl), token);
  assert.equal(pairingPathFromUrl(`/authors-forge?token=${encodeURIComponent(token)}`), "/authors-forge");
  assert.equal(authorizePairingToken(token, lan), true);
  assert.equal(authorizePairingToken("wrong", lan), false);

  const cookie = String(ownerPairingCookieHeaders({ token })["set-cookie"]);
  assert.match(cookie, /kings_owner_token=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Path=\//);
  assert.equal(protectedApiPath("/api/project-owner/missions"), true);
  assert.equal(protectedApiPath("/api/usage"), true);
  assert.equal(
    protectedApiPath("/health"),
    false,
    "minimal liveness must remain probeable without exposing detailed runtime state",
  );
  assert.equal(protectedApiPath("/ready"), true);
  assert.equal(protectedApiPath("/manifest.webmanifest"), false);

  console.log("K.I.N.G.S. OWNER HTTP → LOOPBACK SAFE DEFAULT: SUCCESS");
  console.log("K.I.N.G.S. OWNER HTTP → LAN FAIL-CLOSED AUTH: SUCCESS");
  console.log("K.I.N.G.S. OWNER HTTP → BEARER/COOKIE PAIRING: SUCCESS");
  console.log("K.I.N.G.S. OWNER HTTP → MINIMAL HEALTH / PRIVATE READINESS: SUCCESS");
  console.log("TREE-KCM-OWNER-HTTP-AUTH: SUCCESS");
}

try {
  main();
} catch (error) {
  console.error("TREE-KCM-OWNER-HTTP-AUTH: FAILURE");
  console.error(error);
  process.exitCode = 1;
}
