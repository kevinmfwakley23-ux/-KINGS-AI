import { isDeepStrictEqual } from "node:util";

import type {
  CompletionEvidence,
} from "./completion-gate";

import type {
  GovernedMemoryExecutionResult,
} from "./memory-governed-execution-pipeline";

import type {
  ModelToolCallProposal,
} from "./model-interface";

export const MEMORY_TO_ACTION_EVIDENCE_TYPE =
  "memory-to-action-evaluation";

export const MEMORY_TO_ACTION_CRITERION =
  "Retrieved mission memory is applied to constraint recognition, tool selection, and parameter grounding.";

export type JsonPrimitive =
  | string
  | number
  | boolean
  | null;

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type MemoryToActionStageName =
  | "retrieval"
  | "constraint-recognition"
  | "tool-selection"
  | "parameter-grounding";

export interface MemoryBackedConstraintExpectation {
  id: string;
  sourceMemoryId: string;
}

export interface MemoryBackedToolExpectation {
  toolId: string;
  sourceMemoryIds: readonly string[];
}

export interface MemoryBackedParameterExpectation {
  path: readonly string[];
  expected: JsonValue;
  sourceMemoryId: string;
}

export interface MemoryToActionExpectation {
  scenarioId: string;
  taskId: string;
  missionId: string;
  requiredMemoryIds: readonly string[];
  constraints: readonly MemoryBackedConstraintExpectation[];
  tool: MemoryBackedToolExpectation;
  parameters: readonly MemoryBackedParameterExpectation[];
}

export interface MemoryToActionObservation {
  recognizedConstraintIds: readonly string[];
  toolCall: Pick<
    ModelToolCallProposal,
    "toolId" | "arguments"
  >;
}

export interface MemoryToActionStageResult {
  name: MemoryToActionStageName;
  passed: boolean;
  score: number;
  successfulChecks: number;
  totalChecks: number;
  reasons: string[];
}

export interface MemoryToActionEvaluationRecord {
  id: string;
  runId: string;
  scenarioId: string;
  taskId: string;
  missionId: string;
  passed: boolean;
  score: number;
  stages: Record<
    MemoryToActionStageName,
    MemoryToActionStageResult
  >;
  selectedMemoryIds: string[];
  usedMemoryIds: string[];
  retrievedButUnusedMemoryIds: string[];
  createdAt: string;
}

export interface MemoryToActionEvaluationInput {
  runId: string;
  createdAt: string;
  expectation: MemoryToActionExpectation;
  memoryExecution: GovernedMemoryExecutionResult;
  observation: MemoryToActionObservation;
}

const PROHIBITED_PATH_SEGMENTS =
  new Set([
    "__proto__",
    "constructor",
    "prototype",
  ]);

export class MemoryToActionEvaluationAuthority {
  evaluate(
    input: MemoryToActionEvaluationInput,
  ): MemoryToActionEvaluationRecord {
    this.validate(input);

    const selected =
      new Set(
        input.memoryExecution.selectedMemoryIds,
      );

    const recognized =
      new Set(
        input.observation.recognizedConstraintIds,
      );

    const used =
      new Set<string>();

    const retrievalReasons: string[] = [];
    let retrieved = 0;

    for (
      const memoryId of
        input.expectation.requiredMemoryIds
    ) {
      if (selected.has(memoryId)) {
        retrieved += 1;
      } else {
        retrievalReasons.push(
          `Required memory "${memoryId}" was not selected for execution.`,
        );
      }
    }

    const constraintReasons: string[] = [];
    let recognizedConstraints = 0;

    for (
      const constraint of
        input.expectation.constraints
    ) {
      const sourceRetrieved =
        selected.has(
          constraint.sourceMemoryId,
        );

      const constraintRecognized =
        recognized.has(
          constraint.id,
        );

      if (!sourceRetrieved) {
        constraintReasons.push(
          `Constraint "${constraint.id}" cannot be attributed because source memory "${constraint.sourceMemoryId}" was not selected.`,
        );
      }

      if (!constraintRecognized) {
        constraintReasons.push(
          `Required constraint "${constraint.id}" was not recognized.`,
        );
      }

      if (
        sourceRetrieved &&
        constraintRecognized
      ) {
        recognizedConstraints += 1;
        used.add(
          constraint.sourceMemoryId,
        );
      }
    }

    const toolReasons: string[] = [];
    const toolMatches =
      input.observation.toolCall.toolId ===
      input.expectation.tool.toolId;

    if (!toolMatches) {
      toolReasons.push(
        `Expected tool "${input.expectation.tool.toolId}" but observed "${input.observation.toolCall.toolId}".`,
      );
    }

    const missingToolSources =
      input.expectation.tool.sourceMemoryIds
        .filter(
          (memoryId) =>
            !selected.has(memoryId),
        );

    for (
      const memoryId of missingToolSources
    ) {
      toolReasons.push(
        `Tool selection cannot be attributed because source memory "${memoryId}" was not selected.`,
      );
    }

    const toolGrounded =
      toolMatches &&
      missingToolSources.length === 0;

    if (toolGrounded) {
      for (
        const memoryId of
          input.expectation.tool.sourceMemoryIds
      ) {
        used.add(memoryId);
      }
    }

    const parameterReasons: string[] = [];
    let groundedParameters = 0;

    for (
      const parameter of
        input.expectation.parameters
    ) {
      const sourceRetrieved =
        selected.has(
          parameter.sourceMemoryId,
        );

      const observed =
        readOwnPath(
          input.observation.toolCall.arguments,
          parameter.path,
        );

      if (!sourceRetrieved) {
        parameterReasons.push(
          `Parameter "${formatPath(parameter.path)}" cannot be attributed because source memory "${parameter.sourceMemoryId}" was not selected.`,
        );
      }

      if (!observed.found) {
        parameterReasons.push(
          `Required parameter "${formatPath(parameter.path)}" was not provided.`,
        );
      } else if (
        !isDeepStrictEqual(
          observed.value,
          parameter.expected,
        )
      ) {
        parameterReasons.push(
          `Parameter "${formatPath(parameter.path)}" expected ${describeJson(parameter.expected)} but observed ${describeJson(observed.value)}.`,
        );
      }

      if (
        sourceRetrieved &&
        observed.found &&
        isDeepStrictEqual(
          observed.value,
          parameter.expected,
        )
      ) {
        groundedParameters += 1;
        used.add(
          parameter.sourceMemoryId,
        );
      }
    }

    const stages: Record<
      MemoryToActionStageName,
      MemoryToActionStageResult
    > = {
      retrieval:
        stageResult(
          "retrieval",
          retrieved,
          input.expectation.requiredMemoryIds.length,
          retrievalReasons,
        ),

      "constraint-recognition":
        stageResult(
          "constraint-recognition",
          recognizedConstraints,
          input.expectation.constraints.length,
          constraintReasons,
        ),

      "tool-selection":
        stageResult(
          "tool-selection",
          toolGrounded ? 1 : 0,
          1,
          toolReasons,
        ),

      "parameter-grounding":
        stageResult(
          "parameter-grounding",
          groundedParameters,
          input.expectation.parameters.length,
          parameterReasons,
        ),
    };

    const stageValues =
      Object.values(stages);

    const score =
      stageValues.reduce(
        (total, stage) =>
          total + stage.score,
        0,
      ) /
      stageValues.length;

    const usedMemoryIds =
      input.memoryExecution.selectedMemoryIds
        .filter(
          (memoryId) =>
            used.has(memoryId),
        );

    return {
      id:
        `MEMORY-TO-ACTION:${input.runId}:${input.expectation.scenarioId}`,
      runId:
        input.runId,
      scenarioId:
        input.expectation.scenarioId,
      taskId:
        input.expectation.taskId,
      missionId:
        input.expectation.missionId,
      passed:
        stageValues.every(
          (stage) => stage.passed,
        ),
      score,
      stages,
      selectedMemoryIds:
        [...input.memoryExecution.selectedMemoryIds],
      usedMemoryIds,
      retrievedButUnusedMemoryIds:
        input.memoryExecution.selectedMemoryIds
          .filter(
            (memoryId) =>
              !used.has(memoryId),
          ),
      createdAt:
        input.createdAt,
    };
  }

  private validate(
    input: MemoryToActionEvaluationInput,
  ): void {
    requiredText(
      input.runId,
      "run id",
    );
    requiredText(
      input.expectation.scenarioId,
      "scenario id",
    );
    requiredText(
      input.expectation.taskId,
      "task id",
    );
    requiredText(
      input.expectation.missionId,
      "mission id",
    );
    requiredText(
      input.expectation.tool.toolId,
      "expected tool id",
    );

    if (
      !Number.isFinite(
        Date.parse(input.createdAt),
      )
    ) {
      throw new Error(
        "K.I.N.G.S. Memory-to-Action Evaluation: createdAt must be a valid timestamp.",
      );
    }

    if (
      input.expectation.requiredMemoryIds.length === 0
    ) {
      throw new Error(
        "K.I.N.G.S. Memory-to-Action Evaluation: at least one required memory is needed.",
      );
    }

    if (
      input.expectation.tool.sourceMemoryIds.length === 0
    ) {
      throw new Error(
        "K.I.N.G.S. Memory-to-Action Evaluation: tool selection requires at least one source memory.",
      );
    }

    assertUniqueNonEmpty(
      input.expectation.requiredMemoryIds,
      "required memory ids",
    );
    assertUniqueNonEmpty(
      input.expectation.constraints.map(
        (constraint) => constraint.id,
      ),
      "constraint ids",
    );
    assertUniqueNonEmpty(
      input.expectation.tool.sourceMemoryIds,
      "tool source memory ids",
    );
    assertUniqueNonEmpty(
      input.memoryExecution.selectedMemoryIds,
      "selected memory ids",
    );
    assertUniqueNonEmpty(
      input.observation.recognizedConstraintIds,
      "recognized constraint ids",
    );

    const requiredMemories =
      new Set(
        input.expectation.requiredMemoryIds,
      );

    const attributedMemoryIds = [
      ...input.expectation.constraints.map(
        (constraint) =>
          constraint.sourceMemoryId,
      ),
      ...input.expectation.tool.sourceMemoryIds,
      ...input.expectation.parameters.map(
        (parameter) =>
          parameter.sourceMemoryId,
      ),
    ];

    for (
      const memoryId of attributedMemoryIds
    ) {
      requiredText(
        memoryId,
        "attributed source memory id",
      );

      if (!requiredMemories.has(memoryId)) {
        throw new Error(
          `K.I.N.G.S. Memory-to-Action Evaluation: attributed source memory "${memoryId}" must be listed as required.`,
        );
      }
    }

    const parameterPaths =
      input.expectation.parameters.map(
        (parameter) => {
          if (parameter.path.length === 0) {
            throw new Error(
              "K.I.N.G.S. Memory-to-Action Evaluation: parameter paths cannot be empty.",
            );
          }

          for (const segment of parameter.path) {
            requiredText(
              segment,
              "parameter path segment",
            );

            if (
              PROHIBITED_PATH_SEGMENTS.has(
                segment,
              )
            ) {
              throw new Error(
                `K.I.N.G.S. Memory-to-Action Evaluation: unsafe parameter path segment "${segment}".`,
              );
            }
          }

          assertJsonValue(
            parameter.expected,
            `expected parameter "${formatPath(parameter.path)}"`,
          );

          return JSON.stringify(
            parameter.path,
          );
        });

    assertUniqueNonEmpty(
      parameterPaths,
      "parameter paths",
    );

    assertJsonValue(
      input.observation.toolCall.arguments,
      "observed tool arguments",
    );

    const memoryExecution =
      input.memoryExecution;

    if (
      memoryExecution.taskId !==
        input.expectation.taskId ||
      memoryExecution.missionId !==
        input.expectation.missionId ||
      memoryExecution.executionContext.taskId !==
        input.expectation.taskId ||
      memoryExecution.executionContext.missionId !==
        input.expectation.missionId
    ) {
      throw new Error(
        "K.I.N.G.S. Memory-to-Action Evaluation: mission or task identity does not match the governed memory execution result.",
      );
    }

    const selected =
      [...memoryExecution.selectedMemoryIds]
        .sort();

    const contextMemories =
      memoryExecution.executionContext.memories
        .map((memory) => memory.id)
        .sort();

    if (
      !isDeepStrictEqual(
        selected,
        contextMemories,
      )
    ) {
      throw new Error(
        "K.I.N.G.S. Memory-to-Action Evaluation: selected memory ids must match the memories in execution context.",
      );
    }
  }
}

export function createMemoryToActionCompletionEvidence(
  record: MemoryToActionEvaluationRecord,
): CompletionEvidence {
  const stageSummary =
    Object.values(record.stages)
      .map(
        (stage) =>
          `${stage.name}=${stage.successfulChecks}/${stage.totalChecks}`,
      )
      .join(", ");

  return {
    id:
      `EVIDENCE:${record.id}`,
    type:
      MEMORY_TO_ACTION_EVIDENCE_TYPE,
    criterion:
      MEMORY_TO_ACTION_CRITERION,
    status:
      record.passed
        ? "passed"
        : "failed",
    summary:
      `Memory-to-action scenario "${record.scenarioId}" ${record.passed ? "passed" : "failed"}: ${stageSummary}.`,
    verificationReference:
      `memory-to-action://${encodeURIComponent(record.runId)}/${encodeURIComponent(record.scenarioId)}`,
    createdAt:
      record.createdAt,
  };
}

function stageResult(
  name: MemoryToActionStageName,
  successfulChecks: number,
  totalChecks: number,
  reasons: string[],
): MemoryToActionStageResult {
  const score =
    totalChecks === 0
      ? 1
      : successfulChecks /
        totalChecks;

  return {
    name,
    passed:
      successfulChecks ===
        totalChecks &&
      reasons.length === 0,
    score,
    successfulChecks,
    totalChecks,
    reasons:
      [...reasons],
  };
}

function readOwnPath(
  source: Record<string, unknown>,
  path: readonly string[],
): {
  found: boolean;
  value?: unknown;
} {
  let current: unknown =
    source;

  for (const segment of path) {
    if (
      current === null ||
      typeof current !== "object" ||
      !Object.prototype.hasOwnProperty.call(
        current,
        segment,
      )
    ) {
      return {
        found: false,
      };
    }

    current =
      (
        current as
          Record<string, unknown>
      )[segment];
  }

  return {
    found: true,
    value:
      current,
  };
}

function formatPath(
  path: readonly string[],
): string {
  return path.join(".");
}

function describeJson(
  value: unknown,
): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function requiredText(
  value: string,
  label: string,
): void {
  if (!String(value ?? "").trim()) {
    throw new Error(
      `K.I.N.G.S. Memory-to-Action Evaluation: ${label} is required.`,
    );
  }
}

function assertUniqueNonEmpty(
  values: readonly string[],
  label: string,
): void {
  for (const value of values) {
    requiredText(
      value,
      label,
    );
  }

  if (
    new Set(values).size !==
      values.length
  ) {
    throw new Error(
      `K.I.N.G.S. Memory-to-Action Evaluation: ${label} must be unique.`,
    );
  }
}

function assertJsonValue(
  value: unknown,
  label: string,
  visited = new Set<object>(),
): void {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(
        `K.I.N.G.S. Memory-to-Action Evaluation: ${label} must contain finite JSON numbers.`,
      );
    }

    return;
  }

  if (
    typeof value !== "object" ||
    value === undefined
  ) {
    throw new Error(
      `K.I.N.G.S. Memory-to-Action Evaluation: ${label} must be JSON-serializable.`,
    );
  }

  if (visited.has(value)) {
    throw new Error(
      `K.I.N.G.S. Memory-to-Action Evaluation: ${label} cannot contain cycles.`,
    );
  }

  visited.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      assertJsonValue(
        item,
        label,
        visited,
      );
    }
  } else {
    const prototype =
      Object.getPrototypeOf(value);

    if (
      prototype !== Object.prototype &&
      prototype !== null
    ) {
      throw new Error(
        `K.I.N.G.S. Memory-to-Action Evaluation: ${label} must contain plain JSON objects.`,
      );
    }

    if (
      Object.getOwnPropertySymbols(value)
        .length > 0
    ) {
      throw new Error(
        `K.I.N.G.S. Memory-to-Action Evaluation: ${label} cannot contain symbol keys.`,
      );
    }

    for (
      const [key, item] of
        Object.entries(value)
    ) {
      if (
        PROHIBITED_PATH_SEGMENTS.has(key)
      ) {
        throw new Error(
          `K.I.N.G.S. Memory-to-Action Evaluation: ${label} contains unsafe key "${key}".`,
        );
      }

      assertJsonValue(
        item,
        label,
        visited,
      );
    }
  }

  visited.delete(value);
}
