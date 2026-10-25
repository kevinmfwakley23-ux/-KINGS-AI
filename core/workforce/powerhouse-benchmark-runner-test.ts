import {
  PowerhouseBenchmarkRunner,
  validatePowerhouseBenchmarkManifest,
  type PowerhouseBenchmarkManifest,
  type PowerhouseBenchmarkResponse,
} from "./powerhouse-benchmark-runner";
import type { IntelligenceCapability, ModelIdentity } from "./model-interface";
import { ModelCapabilityRegistry } from "./model-capability-registry";
import { PowerhouseQualificationAuthority } from "./powerhouse-domain-qualification";
import { listPowerhouseServiceDomains } from "./powerhouse-service-domain";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function expectFailure(action: () => unknown, expected: string): void {
  let message = "";
  try {
    action();
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  assert(message.includes(expected), `Expected failure containing "${expected}", received "${message}".`);
}

function manifest(): PowerhouseBenchmarkManifest {
  const items: PowerhouseBenchmarkManifest["items"] = [];
  for (const profile of listPowerhouseServiceDomains()) {
    items.push({
      id: `${profile.id}-train-01`,
      domain: profile.id,
      split: "train",
      sourceGroupId: `${profile.id}-training-source-01`,
      prompt: `Rights-cleared ${profile.id} training example 01.`,
      critical: false,
      rights: {
        licenseId: "owner-authored-v1",
        sourceReference: `source:${profile.id}:train:01`,
        permissionReference: `permission:${profile.id}:train:01`,
        permissionEvidenceSha256: "a".repeat(64),
        attestedBy: "corpus-rights-officer-001",
        trainingAllowed: true,
        evaluationAllowed: false,
      },
    });
    for (let index = 1; index <= 20; index += 1) {
      const id = `${profile.id}-held-out-${String(index).padStart(2, "0")}`;
      const rubricTask = profile.id === "storytelling" && index === 1;
      items.push({
        id,
        domain: profile.id,
        split: "held-out",
        sourceGroupId: `${profile.id}-evaluation-source-${String(index).padStart(2, "0")}`,
        prompt: `Rights-cleared ${profile.id} held-out task ${String(index).padStart(2, "0")}.`,
        critical: index === 1,
        rights: {
          licenseId: "owner-authored-v1",
          sourceReference: `source:${id}`,
          permissionReference: `permission:${id}`,
          permissionEvidenceSha256: "b".repeat(64),
          attestedBy: "corpus-rights-officer-001",
          trainingAllowed: false,
          evaluationAllowed: true,
        },
        scoring: rubricTask
          ? {
              kind: "attested-rubric",
              rubricId: "story-continuity-rubric-v1",
              minimumScore: 85,
            }
          : {
              kind: "deterministic",
              requiredSubstrings: [`verified-${id}`],
              forbiddenSubstrings: ["invented-proof"],
              minimumCharacters: 10,
            },
      });
    }
  }
  return {
    benchmarkId: "kings-powerhouse-seven-domain",
    benchmarkVersion: "1.0.0",
    createdAt: "2026-10-24T18:00:00.000Z",
    items,
  };
}

function responses(source: PowerhouseBenchmarkManifest): PowerhouseBenchmarkResponse[] {
  return source.items
    .filter((item) => item.split === "held-out")
    .map((item) => ({
      taskId: item.id,
      modelId: "kings-candidate-001",
      output: `verified-${item.id}`,
      completedAt: "2026-10-24T19:00:00.000Z",
      evidenceReferences: [`provider-response:${item.id}`],
      ...(item.scoring?.kind === "attested-rubric"
        ? {
            review: {
              rubricId: item.scoring.rubricId,
              score: 90,
              evaluatorId: "owner-approved-reviewer-001",
              evidenceReference: `rubric-review:${item.id}`,
            },
          }
        : {}),
    }));
}

const validManifest = manifest();
const manifestHash = validatePowerhouseBenchmarkManifest(validManifest);
assert(/^[a-f0-9]{64}$/u.test(manifestHash), "Validated manifest must receive a SHA-256 identity.");

const runner = new PowerhouseBenchmarkRunner();
const run = runner.run({
  modelId: "kings-candidate-001",
  evaluatedAt: "2026-10-24T20:00:00.000Z",
  manifest: validManifest,
  responses: responses(validManifest),
});
assert(run.domainBenchmarks.length === 7, "Runner must report all seven Powerhouse domains.");
assert(run.taskEvaluations.length === 140, "Runner must evaluate every held-out task.");
assert(run.taskEvaluations.every((result) => result.passed), "Passing evidence must satisfy every task.");
assert(run.domainBenchmarks.every((result) => result.totalTasks === 20), "Every domain must retain 20 held-out tasks.");
assert(run.domainBenchmarks.every((result) => result.passedTasks === 20), "Every passing task must be counted.");
assert(run.domainBenchmarks.every((result) => result.criticalFailures === 0), "Passing run must have no critical failures.");
assert(run.domainBenchmarks.every((result) => result.evidenceReferences.length >= 23), "Domain evidence must preserve hashes and provider references.");
assert(/^[a-f0-9]{64}$/u.test(run.runSha256), "Run must receive a SHA-256 identity.");

const capabilities = [...new Set(
  listPowerhouseServiceDomains().flatMap((profile) => profile.requiredCapabilities),
)];
const capabilityRegistry = new ModelCapabilityRegistry();
const candidateIdentity: ModelIdentity = {
  providerId: "benchmark-provider",
  modelId: "kings-candidate-001",
  displayName: "K.I.N.G.S. Candidate 001",
  providerKind: "internal-self-hosted",
  capabilities,
  inputModalities: ["text"],
  outputModalities: ["text"],
  contextWindowTokens: 128_000,
  supportsToolCalling: true,
  supportsStructuredOutput: true,
  available: true,
};
capabilityRegistry.register({
  model: candidateIdentity,
  capabilities: capabilities.map((capability: IntelligenceCapability) => ({
    capability,
    strength: 90,
    status: "verified" as const,
    evidenceReferences: [`capability-evidence:${capability}`],
    verifiedAt: "2026-10-24T19:30:00.000Z",
  })),
});
const qualificationAuthority = new PowerhouseQualificationAuthority(capabilityRegistry);
const qualification = qualificationAuthority.evaluate({
  modelId: "kings-candidate-001",
  submittedAt: "2026-10-24T20:00:00.000Z",
  domainBenchmarks: run.domainBenchmarks,
});
assert(qualification.productionQualified, "Runner output must feed the production qualification authority.");
assert(!qualification.topTierProven, "A benchmark pass alone must not become a top-tier claim.");

const repeatedRun = runner.run({
  modelId: "kings-candidate-001",
  evaluatedAt: "2026-10-24T20:00:00.000Z",
  manifest: validManifest,
  responses: responses(validManifest),
});
assert(repeatedRun.runSha256 === run.runSha256, "Identical evidence must produce an identical run hash.");

const missingCriticalResponse = responses(validManifest).filter((item) => item.taskId !== "chat-held-out-01");
const failedRun = runner.run({
  modelId: "kings-candidate-001",
  evaluatedAt: "2026-10-24T20:00:00.000Z",
  manifest: validManifest,
  responses: missingCriticalResponse,
});
const chatResult = failedRun.domainBenchmarks.find((item) => item.domain === "chat");
assert(chatResult?.passedTasks === 19, "An unanswered task must count as failed.");
assert(chatResult?.criticalFailures === 1, "An unanswered critical task must count as a critical failure.");
const failedQualification = qualificationAuthority.evaluate({
  modelId: "kings-candidate-001",
  submittedAt: "2026-10-24T20:00:00.000Z",
  domainBenchmarks: failedRun.domainBenchmarks,
});
assert(!failedQualification.productionQualified, "A runner critical failure must block model promotion.");

const leakedManifest = manifest();
const chatTrain = leakedManifest.items.find((item) => item.id === "chat-train-01");
const chatHeldOut = leakedManifest.items.find((item) => item.id === "chat-held-out-01");
if (!chatTrain || !chatHeldOut) throw new Error("Test fixture failure.");
chatHeldOut.sourceGroupId = chatTrain.sourceGroupId;
expectFailure(() => validatePowerhouseBenchmarkManifest(leakedManifest), "crosses train and held-out splits");

const duplicatePromptManifest = manifest();
duplicatePromptManifest.items[1].prompt = duplicatePromptManifest.items[0].prompt.toUpperCase();
expectFailure(() => validatePowerhouseBenchmarkManifest(duplicatePromptManifest), "duplicate normalized prompt");

const deniedRightsManifest = manifest();
deniedRightsManifest.items[0].rights.trainingAllowed = false;
expectFailure(() => validatePowerhouseBenchmarkManifest(deniedRightsManifest), "training rights are denied");

const placeholderRightsManifest = manifest();
placeholderRightsManifest.items[0].rights.permissionReference = "TBD";
expectFailure(() => validatePowerhouseBenchmarkManifest(placeholderRightsManifest), "may not be a placeholder");

const invalidRightsHashManifest = manifest();
invalidRightsHashManifest.items[0].rights.permissionEvidenceSha256 = "not-a-sha256";
expectFailure(() => validatePowerhouseBenchmarkManifest(invalidRightsHashManifest), "permission evidence SHA-256");

const malformedScoringManifest = manifest();
(malformedScoringManifest.items[1].scoring as { requiredSubstrings: unknown }).requiredSubstrings = "not-an-array";
expectFailure(() => validatePowerhouseBenchmarkManifest(malformedScoringManifest), "must be a text array");

const selfReviewedResponses = responses(validManifest);
const storyReview = selfReviewedResponses.find((item) => item.taskId === "storytelling-held-out-01");
if (!storyReview?.review) throw new Error("Test fixture failure.");
storyReview.review.evaluatorId = "kings-candidate-001";
const selfReviewedRun = runner.run({
  modelId: "kings-candidate-001",
  evaluatedAt: "2026-10-24T20:00:00.000Z",
  manifest: validManifest,
  responses: selfReviewedResponses,
});
assert(
  !selfReviewedRun.taskEvaluations.find((item) => item.taskId === "storytelling-held-out-01")?.passed,
  "A model must not attest its own subjective rubric score.",
);

const mismatchedResponses = responses(validManifest);
mismatchedResponses[0].modelId = "different-model";
expectFailure(
  () => runner.run({
    modelId: "kings-candidate-001",
    evaluatedAt: "2026-10-24T20:00:00.000Z",
    manifest: validManifest,
    responses: mismatchedResponses,
  }),
  "response model mismatch",
);

console.log("Powerhouse rights-cleared benchmark runner and leakage gates: SUCCESS");
