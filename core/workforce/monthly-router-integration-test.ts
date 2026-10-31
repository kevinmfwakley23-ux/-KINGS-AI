
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ModelIdentity } from "./model-interface";
import { MonthlyUsageAuthority } from "./monthly-usage-authority";
import { ProviderAdapterRegistry } from "./provider-adapters";
import { createAppRouterRuntime, type RouterRuntimeConfig } from "../../runtimes/app-router/server";

const root = mkdtempSync(join(tmpdir(), "kings-paid-http-"));
const accounts = join(root, "accounts.json");
const ledger = join(root, "ledger.json");
const ownerToken = randomBytes(32).toString("hex");
const paidToken = randomBytes(32).toString("hex");
const identity: ModelIdentity = {
  providerId: "test-provider", modelId: "mock-real-transport",
  displayName: "Controlled test transport", providerKind: "internal-self-hosted",
  capabilities: ["reasoning"], inputModalities: ["text"], outputModalities: ["text"],
  contextWindowTokens: 128000, supportsToolCalling: false,
  supportsStructuredOutput: false, available: true,
};
let modelRequests = 0;
let lastOutputCap: number | undefined;
const providers = new ProviderAdapterRegistry();
providers.register({
  descriptor: { id: "test-provider", name: "Test", kind: "internal-self-hosted", available: true },
  listModels: () => [identity],
  getModel: () => undefined,
  execute: async (_modelId, request) => {
    modelRequests += 1;
    lastOutputCap = request.maxOutputTokens;
    const now = new Date().toISOString();
    return { success: true, response: {
      requestId: request.id, model: identity, content: "Model transport executed.",
      toolCallProposals: [], usage: {
        elapsedMs: 1, tokensUsed: 55, inputTokens: 30, outputTokens: 25,
        iterationsUsed: 1, estimatedCost: 0,
      },
      metadata: { requestId: request.id, startedAt: now, completedAt: now, latencyMs: 1 },
    } };
  },
});
const account = {
  id: "subscriber_alpha", keySha256: MonthlyUsageAuthority.keyDigest(paidToken),
  planId: "starter", status: "active", paidThrough: "2099-12-31T23:59:59Z",
  monthlyTokens: 8000, monthlyRequests: 2, maxOutputTokens: 256,
};
const config: RouterRuntimeConfig = {
  host: "127.0.0.1", port: 0, accessToken: ownerToken,
  providerOrder: ["test-provider"], researchMaxSources: 3,
  researchMaxResponseBytes: 1024, researchTimeoutMs: 1000,
  usageAccountsFile: accounts, usageLedgerFile: ledger,
};
const responseBody = { model: "auto", input: "Identify the collectible accurately.", service_domain: "chat" };
const headers = (token: string) => ({ authorization: "Bearer " + token, "content-type": "application/json" });
const sleep = (ms: number) => new Promise<void>(done => setTimeout(done, ms));

async function main(): Promise<void> {
  writeFileSync(accounts, JSON.stringify({ version: 1, accounts: [account] }));
  const server = createAppRouterRuntime(config, providers);
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    const url = "http://127.0.0.1:" + port;
    const send = (token: string, body: Record<string, unknown> = responseBody) => fetch(url + "/v1/responses", {
      method: "POST", headers: headers(token), body: JSON.stringify(body),
    });

    assert.equal((await send("wrong")).status, 401);
    assert.equal((await fetch(url + "/v1/usage")).status, 401);
    assert.equal((await fetch(url + "/v1/brain/research/retrieve", {
      method: "POST", headers: headers(paidToken), body: "{}",
    })).status, 403, "subscriber must not execute owner-only internet research");
    const ownerStatus = await fetch(url + "/v1/usage", { headers: headers(ownerToken) });
    assert.equal((await ownerStatus.json()).unlimitedSubscription, true);

    const first = await send(paidToken);
    assert.equal(first.status, 200);
    const payload = await first.json() as { usage: { total_tokens: number } };
    assert.equal(payload.usage.total_tokens, 55);
    assert.equal(lastOutputCap, 256, "subscriber max output must be forwarded to provider");
    const usage = await fetch(url + "/v1/usage", { headers: headers(paidToken) });
    const state = await usage.json() as { usage: { usedTokens: number; usedRequests: number } };
    assert.equal(state.usage.usedTokens, 55);
    assert.equal(state.usage.usedRequests, 1);
    assert.equal((await send(paidToken)).status, 200);
    const denied = await send(paidToken);
    assert.equal(denied.status, 429, "exhausted monthly request allowance must block model invocation");
    assert.equal(modelRequests, 2);

    assert.equal((await send(ownerToken)).status, 200, "owner token bypasses subscriber quota only");
    assert.equal(modelRequests, 3);

    const oversized = await send(paidToken, { ...responseBody, max_output_tokens: 1000 });
    assert.equal(oversized.status, 403, "subscriber cannot raise model output cap through a request");
    assert.equal(modelRequests, 3);

    writeFileSync(accounts, JSON.stringify({ version: 1, accounts: [{
      ...account, planId: "pro", monthlyRequests: 4, maxOutputTokens: 300,
    }] }));
    await sleep(5);
    assert.equal((await send(paidToken)).status, 200, "owner-approved plan increase takes effect");
    assert.equal(modelRequests, 4);

    writeFileSync(accounts, JSON.stringify({ version: 1, accounts: [{ ...account, status: "suspended" }] }));
    assert.equal((await send(paidToken)).status, 403, "subscription revocation takes effect immediately");
    assert.equal(modelRequests, 4);
  } finally {
    await new Promise<void>(done => server.close(() => done()));
    rmSync(root, { recursive: true, force: true });
  }
  console.log("K.I.N.G.S. paid app-router HTTP enforcement: PASS");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
