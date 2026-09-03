import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { KingsAiGatewayRuntime } from "./ai-gateway-runtime";
import {
  assessOwnerRuntimeReadiness,
  hasRoutableGatewayCodingModel,
  selectAutomaticCodingRoute,
} from "./owner-runtime-readiness";

function runtime(input: {
  providerId?: string;
  providerName?: string;
  healthy?: boolean;
  modelId?: string;
  displayName?: string;
  codingEligible?: boolean;
  verifiedCodingRoute?: boolean;
} = {}): KingsAiGatewayRuntime {
  const providerId = input.providerId ?? "9router";
  const providerName = input.providerName ?? "9Router";
  return {
    gateways: [{
      adapter: {
        descriptor: {
          id: providerId,
          name: providerName,
        },
      },
      health: {
        ok: input.healthy ?? true,
      },
    }],
    catalog: [{
      providerId,
      providerName,
      gatewayKind: providerId === "omniroute" ? "omniroute" : "9router",
      modelId: input.modelId ?? "coding/model-1",
      displayName: input.displayName ?? "Coding Model 1",
      codingEligible: input.codingEligible ?? true,
      verifiedCodingRoute: input.verifiedCodingRoute ?? false,
    }],
  } as unknown as KingsAiGatewayRuntime;
}

async function main(): Promise<void> {
  const offline = assessOwnerRuntimeReadiness({
    localModelRoutable: false,
    gatewayCodingRouteRoutable: false,
    repositoryExecutionAllowed: false,
  });
  assert.equal(offline.ready, false);
  assert.equal(offline.aiExecutionReady, false);
  assert.equal(offline.repositoryExecutionReady, false);
  assert.equal(offline.blockers.length, 2);

  const localReady = assessOwnerRuntimeReadiness({
    localModelRoutable: true,
    gatewayCodingRouteRoutable: false,
    repositoryExecutionAllowed: true,
  });
  assert.equal(localReady.ready, true);
  assert.equal(localReady.blockers.length, 0);

  const gatewayReady = assessOwnerRuntimeReadiness({
    localModelRoutable: false,
    gatewayCodingRouteRoutable: true,
    repositoryExecutionAllowed: true,
  });
  assert.equal(gatewayReady.ready, true);
  assert.equal(gatewayReady.aiExecutionReady, true);

  assert.equal(
    hasRoutableGatewayCodingModel(runtime()),
    true,
    "a healthy 9Router coding model should make gateway AI execution routable",
  );
  assert.equal(
    hasRoutableGatewayCodingModel(runtime({ healthy: false })),
    false,
    "an unhealthy gateway must not be considered routable",
  );
  assert.equal(
    hasRoutableGatewayCodingModel(runtime({ codingEligible: false })),
    false,
    "a non-coding model must not satisfy coding readiness",
  );

  const nineRouterRoute = selectAutomaticCodingRoute(runtime());
  assert.deepEqual(nineRouterRoute, {
    providerId: "9router",
    modelId: "coding/model-1",
    label: "9Router: Coding Model 1",
  });

  const omniRoute = selectAutomaticCodingRoute(runtime({
    providerId: "omniroute",
    providerName: "OmniRoute",
    modelId: "auto/coding",
    displayName: "Auto Coding",
    verifiedCodingRoute: true,
  }));
  assert.deepEqual(omniRoute, {
    providerId: "omniroute",
    modelId: "auto/coding",
    label: "OmniRoute Auto Coding",
  });

  assert.equal(
    selectAutomaticCodingRoute(runtime({ healthy: false })),
    null,
    "automatic routing must fail closed when gateway health is bad",
  );

  const serverSource = await readFile(
    join(process.cwd(), "ui", "project-owner", "local-server.ts"),
    "utf8",
  );
  assert.match(
    serverSource,
    /assessOwnerRuntimeReadiness/,
    "owner server must use the shared readiness contract",
  );
  assert.match(
    serverSource,
    /selectAutomaticCodingRoute/,
    "owner server must use the tested automatic coding route selector",
  );
  assert.match(
    serverSource,
    /ok:\s*readiness\.ready/,
    "health payload must not hard-code a green status",
  );
  assert.match(
    serverSource,
    /req\.url === "\/ready"/,
    "owner server must expose a readiness probe",
  );
  assert.match(
    serverSource,
    /readiness\.ready \? 200 : 503/,
    "readiness probe must return HTTP 503 when production execution is unavailable",
  );
  assert.match(
    serverSource,
    /identifiesAsBubblewrap/,
    "owner server must verify Bubblewrap identity rather than path existence alone",
  );

  const statusSource = await readFile(
    join(process.cwd(), "ui", "project-owner", "kings-status.sh"),
    "utf8",
  );
  assert.match(
    statusSource,
    /\/ready/,
    "status command must query live production readiness",
  );
  assert.match(
    statusSource,
    /PRODUCTION READINESS: NOT READY/,
    "status command must distinguish a running process from a working coding runtime",
  );
  assert.doesNotMatch(
    statusSource,
    /^MODEL:\s*qwen2\.5-coder:1\.5b$/m,
    "status command must not hard-code a model and imply that it is live",
  );

  console.log("K.I.N.G.S. OWNER RUNTIME → OFFLINE FAIL-CLOSED: SUCCESS");
  console.log("K.I.N.G.S. OWNER RUNTIME → LOCAL AI READY: SUCCESS");
  console.log("K.I.N.G.S. OWNER RUNTIME → 9ROUTER DEFAULT ROUTE: SUCCESS");
  console.log("K.I.N.G.S. OWNER RUNTIME → OMNIROUTE PREFERRED ROUTE: SUCCESS");
  console.log("K.I.N.G.S. OWNER RUNTIME → HEALTH CONTRACT INTEGRATION: SUCCESS");
  console.log("K.I.N.G.S. OWNER STATUS → LIVE READINESS PROBE: SUCCESS");
  console.log("TREE-KCM-OWNER-RUNTIME-READINESS: SUCCESS");
}

main().catch((error) => {
  console.error("TREE-KCM-OWNER-RUNTIME-READINESS: FAILURE");
  console.error(error);
  process.exitCode = 1;
});
