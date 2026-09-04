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
  documentedCodingRoute?: boolean;
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
      documentedCodingRoute: input.documentedCodingRoute ?? false,
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

  const localOnly = assessOwnerRuntimeReadiness({
    localModelRoutable: true,
    gatewayCodingRouteRoutable: false,
    repositoryExecutionAllowed: true,
  });
  assert.equal(
    localOnly.ready,
    false,
    "local Ollama alone must not make gateway-first production ready",
  );
  assert.equal(localOnly.localFallbackAvailable, true);
  assert.equal(localOnly.aiExecutionReady, false);
  assert.equal(localOnly.blockers.length, 1);

  const gatewayReady = assessOwnerRuntimeReadiness({
    localModelRoutable: false,
    gatewayCodingRouteRoutable: true,
    repositoryExecutionAllowed: true,
  });
  assert.equal(gatewayReady.ready, true);
  assert.equal(gatewayReady.aiExecutionReady, true);
  assert.equal(gatewayReady.blockers.length, 0);

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
    documentedCodingRoute: true,
    verifiedCodingRoute: false,
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
  assert.match(serverSource, /routingMode:\s*"gateway-first-adaptive"/);
  assert.match(serverSource, /KINGS_ENABLE_OLLAMA_FALLBACK/);
  assert.match(serverSource, /DurableGatewayUsageLedger/);
  assert.match(serverSource, /DurableModelRoutingMetricsStore/);
  assert.match(serverSource, /routingMetricsStore\.load\(\)/);
  assert.match(serverSource, /recordRoutingMetric\(providerId, observedModelId, metric\)/);
  assert.match(serverSource, /pathname === "\/api\/usage"/);
  assert.match(serverSource, /selectAutomaticCodingRoute/);
  assert.match(serverSource, /ok:\s*readiness\.ready/);
  assert.match(serverSource, /pathname === "\/ready"/);
  assert.match(serverSource, /readiness\.ready \? 200 : 503/);
  assert.match(serverSource, /identifiesAsBubblewrap/);
  assert.match(serverSource, /readJsonBody/);
  assert.match(serverSource, /requestBodyLimitBytes/);
  assert.match(
    serverSource,
    /controller\.handle\(incoming\)/,
    "KINGS Auto must reach the core router without being pinned by the HTTP layer",
  );
  assert.doesNotMatch(
    serverSource,
    /preferredProviderId:\s*route\.providerId/,
    "HTTP Auto routing must not collapse the superhost failover candidate pool",
  );
  assert.match(
    serverSource,
    /defaultModel:\s*automaticRoute/,
    "model API must expose the preferred catalog route without forcing execution to stay pinned to it",
  );

  const statusSource = await readFile(
    join(process.cwd(), "ui", "project-owner", "kings-status.sh"),
    "utf8",
  );
  assert.match(statusSource, /\/ready/);
  assert.match(statusSource, /PRODUCTION READINESS: NOT READY/);
  assert.doesNotMatch(
    statusSource,
    /^MODEL:\s*qwen2\.5-coder:1\.5b$/m,
  );

  console.log("K.I.N.G.S. OWNER RUNTIME → OFFLINE FAIL-CLOSED: SUCCESS");
  console.log("K.I.N.G.S. OWNER RUNTIME → LOCAL-ONLY NOT PRODUCTION READY: SUCCESS");
  console.log("K.I.N.G.S. OWNER RUNTIME → 9ROUTER DEFAULT ROUTE: SUCCESS");
  console.log("K.I.N.G.S. OWNER RUNTIME → UNVERIFIED DOCUMENTED OMNIROUTE DEFAULT: SUCCESS");
  console.log("K.I.N.G.S. OWNER RUNTIME → GATEWAY-FIRST HEALTH CONTRACT: SUCCESS");
  console.log("K.I.N.G.S. OWNER RUNTIME → MULTI-ROUTE AUTO FAILOVER CONTRACT: SUCCESS");
  console.log("K.I.N.G.S. OWNER RUNTIME → DURABLE ADAPTIVE ROUTING CONTRACT: SUCCESS");
  console.log("K.I.N.G.S. OWNER RUNTIME → DURABLE USAGE API CONTRACT: SUCCESS");
  console.log("K.I.N.G.S. OWNER RUNTIME → BOUNDED JSON API CONTRACT: SUCCESS");
  console.log("K.I.N.G.S. OWNER STATUS → LIVE READINESS PROBE: SUCCESS");
  console.log("TREE-KCM-OWNER-RUNTIME-READINESS: SUCCESS");
}

main().catch((error) => {
  console.error("TREE-KCM-OWNER-RUNTIME-READINESS: FAILURE");
  console.error(error);
  process.exitCode = 1;
});
