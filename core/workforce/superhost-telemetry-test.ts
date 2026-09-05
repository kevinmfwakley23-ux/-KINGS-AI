import { strict as assert } from "node:assert";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ModelExecutionResult } from "./model-interface";
import {
  DurableSuperhostTelemetryLedger,
  formatTraceparent,
  modelExecutionTelemetry,
  parseTraceparent,
  validateSuperhostTelemetryRecord,
} from "./superhost-telemetry";

function success(): ModelExecutionResult {
  return {
    success: true,
    response: {
      requestId: "telemetry-request-1",
      model: {
        providerId: "omniroute",
        modelId: "auto/coding",
        displayName: "OmniRoute Auto Coding",
        providerKind: "external-routed",
        capabilities: ["coding"],
        inputModalities: ["text"],
        outputModalities: ["text"],
        contextWindowTokens: 128_000,
        supportsToolCalling: true,
        supportsStructuredOutput: true,
        available: true,
      },
      content: "private generated content that must not enter default telemetry",
      toolCallProposals: [],
      usage: {
        elapsedMs: 420,
        tokensUsed: 150,
        iterationsUsed: 1,
        inputTokens: 100,
        outputTokens: 50,
        cachedTokens: 20,
        savedTokens: 10,
        reportedCostUsd: 0.0042,
      },
      metadata: {
        requestId: "telemetry-request-1",
        providerRequestId: "provider-request-abc",
        startedAt: "2026-09-04T14:00:00.000Z",
        completedAt: "2026-09-04T14:00:00.420Z",
        latencyMs: 420,
      },
    },
  };
}

function failure(): ModelExecutionResult {
  return {
    success: false,
    failure: {
      requestId: "telemetry-request-2",
      providerId: "9router",
      modelId: "coder-large",
      retryable: true,
      code: "GATEWAY_HTTP_429",
      message: "rate limited",
      metadata: {
        requestId: "telemetry-request-2",
        startedAt: "2026-09-04T14:01:00.000Z",
        completedAt: "2026-09-04T14:01:00.250Z",
        latencyMs: 250,
      },
    },
  };
}

async function main(): Promise<void> {
  const traceId = "0123456789abcdef0123456789abcdef";
  const parentSpanId = "0123456789abcdef";
  const traceparent = formatTraceparent(traceId, parentSpanId, true);
  assert.equal(traceparent, `00-${traceId}-${parentSpanId}-01`);
  assert.deepEqual(parseTraceparent(traceparent), {
    traceId,
    parentSpanId,
    sampled: true,
  });
  assert.equal(parseTraceparent("00-00000000000000000000000000000000-0123456789abcdef-01"), undefined);
  assert.equal(parseTraceparent("garbage"), undefined);

  const okRecord = modelExecutionTelemetry(
    "omniroute",
    "auto/coding",
    success(),
    { traceId, parentSpanId },
  );
  validateSuperhostTelemetryRecord(okRecord);
  assert.equal(okRecord.status, "ok");
  assert.equal(okRecord.parentSpanId, parentSpanId);
  assert.equal(okRecord.attributes["gen_ai.operation.name"], "chat");
  assert.equal(okRecord.attributes["gen_ai.request.model"], "auto/coding");
  assert.equal(okRecord.attributes["gen_ai.usage.input_tokens"], 100);
  assert.equal(okRecord.attributes["gen_ai.usage.output_tokens"], 50);
  assert.equal(okRecord.attributes["kings.cost.reported_usd"], 0.0042);

  const serialized = JSON.stringify(okRecord);
  assert.doesNotMatch(serialized, /private generated content/);
  assert.doesNotMatch(serialized, /provider-request-abc/);
  assert.doesNotMatch(serialized, /prompt|completion/i);

  const failedRecord = modelExecutionTelemetry(
    "9router",
    "coder-large",
    failure(),
    { traceId },
  );
  assert.equal(failedRecord.status, "error");
  assert.equal(failedRecord.errorCode, "GATEWAY_HTTP_429");
  assert.equal(failedRecord.durationMs, 250);

  const directory = await mkdtemp(join(tmpdir(), "kings-telemetry-"));
  try {
    const file = join(directory, "telemetry.jsonl");
    const ledger = new DurableSuperhostTelemetryLedger(file);
    await Promise.all([
      ledger.record(okRecord),
      ledger.record(failedRecord),
    ]);

    const records = await ledger.list();
    assert.equal(records.length, 2);
    const summary = await ledger.summarize();
    assert.equal(summary.spans, 2);
    assert.equal(summary.okSpans, 1);
    assert.equal(summary.errorSpans, 1);
    assert.equal(summary.modelSpans, 2);
    assert.equal(summary.totalDurationMs, 670);
    assert.equal(summary.averageDurationMs, 335);
    assert.equal(summary.totalInputTokens, 100);
    assert.equal(summary.totalOutputTokens, 50);
    assert.equal(summary.byProvider.omniroute.spans, 1);
    assert.equal(summary.byProvider["9router"].errors, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }

  console.log("K.I.N.G.S. TELEMETRY → W3C TRACE CONTEXT: SUCCESS");
  console.log("K.I.N.G.S. TELEMETRY → OTEL GENAI MODEL/TOKEN ATTRIBUTES: SUCCESS");
  console.log("K.I.N.G.S. TELEMETRY → CONTENT PRIVATE BY DEFAULT: SUCCESS");
  console.log("K.I.N.G.S. TELEMETRY → DURABLE MULTI-PROVIDER SUMMARY: SUCCESS");
  console.log("TREE-KCM-SUPERHOST-TELEMETRY: SUCCESS");
}

main().catch((error) => {
  console.error("TREE-KCM-SUPERHOST-TELEMETRY: FAILURE");
  console.error(error);
  process.exitCode = 1;
});
