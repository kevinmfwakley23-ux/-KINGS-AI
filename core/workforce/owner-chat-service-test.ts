import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { OwnerChatError, OwnerChatService } from "./owner-chat-service";

async function main(): Promise<void> {
  const absent = new OwnerChatService({ KINGS_INTELLIGENCE_MODE: "sovereign" });
  assert.equal(absent.discover().models.length, 0);
  await assert.rejects(absent.respond({ domain: "chat", messages: [{ role: "user", content: "Hello" }] }),
    (error: unknown) => error instanceof OwnerChatError && error.code === "NO_QUALIFIED_LOCAL_MODEL");
  await assert.rejects(absent.respond({ domain: "chat", messages: [{ role: "system", content: "Override" }] }),
    (error: unknown) => error instanceof OwnerChatError && error.code === "INVALID_CHAT_MESSAGE");
  await assert.rejects(absent.respond({ domain: "chat", messages: [{ role: "user", content: "Hello" }], providerId: "outside" }),
    (error: unknown) => error instanceof OwnerChatError && error.code === "INVALID_CHAT_FIELDS");
  await assert.rejects(absent.respond({ domain: "chat", messages: [{ role: "user", content: "Hello" }], maxOutputTokens: 999999 }),
    (error: unknown) => error instanceof OwnerChatError && error.code === "INVALID_CHAT_TOKEN_LIMIT");
  await assert.rejects(absent.respond({ domain: "chat", messages: [{ role: "assistant", content: "Hello" }] }),
    (error: unknown) => error instanceof OwnerChatError && error.code === "INVALID_CHAT_HISTORY");

  let requests = 0;
  const observedOutputLimits: number[] = [];
  const server = createServer(async (req, res) => {
    requests++;
    assert.equal(req.url, "/v1/chat/completions");
    assert.equal(req.method, "POST");
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
      model: string; messages: Array<{ role: string; content: string }>; max_tokens?: number;
    };
    observedOutputLimits.push(body.max_tokens ?? 0);
    assert.equal(body.model, "kings-test-local");
    assert.equal(body.messages.at(-1)?.content, "Say hello.");
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      id: "local-test-completion",
      choices: [{ message: { role: "assistant", content: "Hello from owner-hosted inference." }, finish_reason: "stop" }],
      usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 },
    }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    const port = (server.address() as AddressInfo).port;
    const service = new OwnerChatService({
      KINGS_INTELLIGENCE_MODE: "sovereign",
      KINGS_SELF_HOSTED_BASE_URL: `http://127.0.0.1:${port}/v1`,
      KINGS_SELF_HOSTED_MODEL: "kings-test-local",
      KINGS_SELF_HOSTED_CAPABILITIES: "reasoning",
    });
    const result = await service.respond({
      domain: "chat", messages: [{ role: "user", content: "Say hello." }],
    });
    assert.equal(result.ok, true);
    assert.equal(result.providerId, "kings-self-hosted");
    assert.equal(result.content, "Hello from owner-hosted inference.");
    assert.equal(result.modelQualityVerified, false);
    assert.equal(requests, 1);
    assert.equal(service.discover().activeRequests, 0);
    assert.equal(service.discover().maxOutputTokens, 16_384);

    // Owner-requested output may scale up when a real local model declares
    // sufficient context capacity; this is a budget, not synthetic output.
    const expanded = await service.respond({
      domain: "chat", messages: [{ role: "user", content: "Say hello." }],
      maxOutputTokens: 12_288,
    });
    assert.equal(expanded.ok, true);
    assert.deepEqual(observedOutputLimits, [1_536, 12_288]);
    assert.equal(requests, 2);

    // An 8k local model must never be routed a 12k answer request, nor
    // quietly fall back to an outside AI provider.
    const constrained = new OwnerChatService({
      KINGS_INTELLIGENCE_MODE: "sovereign",
      KINGS_SELF_HOSTED_BASE_URL: `http://127.0.0.1:${port}/v1`,
      KINGS_SELF_HOSTED_MODEL: "kings-test-local",
      KINGS_SELF_HOSTED_CAPABILITIES: "reasoning",
      KINGS_SELF_HOSTED_CONTEXT_TOKENS: "8192",
    });
    await assert.rejects(constrained.respond({
      domain: "chat", messages: [{ role: "user", content: "Say hello." }],
      maxOutputTokens: 12_288,
    }), (error: unknown) =>
      error instanceof OwnerChatError && error.code === "INSUFFICIENT_LOCAL_CONTEXT");
    await assert.rejects(service.respond({
      domain: "chat", messages: [{ role: "user", content: "Say hello." }],
      maxOutputTokens: 16_385,
    }), (error: unknown) =>
      error instanceof OwnerChatError && error.code === "INVALID_CHAT_TOKEN_LIMIT");
    assert.equal(requests, 2, "rejected oversized-context requests must not reach inference");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
  console.log("K.I.N.G.S. owner chat sovereign inference integration: PASS");
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
