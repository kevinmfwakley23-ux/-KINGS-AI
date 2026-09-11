import {
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";

import {
  randomUUID,
} from "node:crypto";

import {
  isDeepStrictEqual,
} from "node:util";

import {
  dirname,
  resolve,
} from "node:path";

import type {
  EvidenceStore,
} from "./evidence-store";

import {
  MemoryToActionEvaluationAuthority,
  createMemoryToActionCompletionEvidence,
  type MemoryToActionEvaluationRecord,
  type MemoryToActionExpectation,
  type MemoryToActionObservation,
  type MemoryToActionStageName,
} from "./memory-to-action-evaluation";

import type {
  GovernedMemoryExecutionResult,
} from "./memory-governed-execution-pipeline";

const STORE_VERSION = 1;

export interface MemoryToActionScenarioExecution {
  memoryExecution: GovernedMemoryExecutionResult;
  observation: MemoryToActionObservation;
}

export interface MemoryToActionEvaluationScenario {
  expectation: MemoryToActionExpectation;
  execute(): Promise<MemoryToActionScenarioExecution>;
}

export interface MemoryToActionEvaluationSummary {
  totalScenarios: number;
  passedScenarios: number;
  failedScenarios: number;
  passRate: number;
  stageScores: Record<
    MemoryToActionStageName,
    number
  >;
}

export interface MemoryToActionEvaluationRun {
  id: string;
  passed: boolean;
  summary: MemoryToActionEvaluationSummary;
  records: MemoryToActionEvaluationRecord[];
  createdAt: string;
}

interface MemoryToActionEvaluationStoreFile {
  version: number;
  runs: MemoryToActionEvaluationRun[];
}

export class MemoryToActionEvaluationJournal {
  private readonly runs =
    new Map<
      string,
      MemoryToActionEvaluationRun
    >();

  private initialized = false;

  constructor(
    private readonly storePath: string,
  ) {
    if (!String(storePath ?? "").trim()) {
      throw new Error(
        "K.I.N.G.S. Memory-to-Action Evaluation Journal: store path is required.",
      );
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.initialized = true;

    let parsed:
      MemoryToActionEvaluationStoreFile;

    try {
      const raw =
        await readFile(
          resolve(this.storePath),
          "utf8",
        );

      parsed =
        JSON.parse(raw) as
          MemoryToActionEvaluationStoreFile;
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return;
      }

      this.initialized = false;

      throw new Error(
        `K.I.N.G.S. Memory-to-Action Evaluation Journal: failed to load persistent state: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (
      !parsed ||
      parsed.version !== STORE_VERSION ||
      !Array.isArray(parsed.runs)
    ) {
      this.initialized = false;

      throw new Error(
        "K.I.N.G.S. Memory-to-Action Evaluation Journal: persistent state has an unsupported schema.",
      );
    }

    try {
      for (const run of parsed.runs) {
        assertStoredRun(run);

        if (this.runs.has(run.id)) {
          throw new Error(
            `duplicate run "${run.id}"`,
          );
        }

        this.runs.set(
          run.id,
          clone(run),
        );
      }
    } catch (error) {
      this.runs.clear();
      this.initialized = false;

      throw new Error(
        `K.I.N.G.S. Memory-to-Action Evaluation Journal: persistent state is invalid: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  has(runId: string): boolean {
    this.requireInitialized();

    return this.runs.has(runId);
  }

  get(
    runId: string,
  ): MemoryToActionEvaluationRun | undefined {
    this.requireInitialized();

    const run =
      this.runs.get(runId);

    return run
      ? clone(run)
      : undefined;
  }

  list(): MemoryToActionEvaluationRun[] {
    this.requireInitialized();

    return [...this.runs.values()]
      .sort(
        (left, right) =>
          left.createdAt.localeCompare(
            right.createdAt,
          ) ||
          left.id.localeCompare(
            right.id,
          ),
      )
      .map(clone);
  }

  async record(
    run: MemoryToActionEvaluationRun,
  ): Promise<void> {
    this.requireInitialized();
    assertStoredRun(run);

    if (this.runs.has(run.id)) {
      throw new Error(
        `K.I.N.G.S. Memory-to-Action Evaluation Journal: duplicate run "${run.id}".`,
      );
    }

    this.runs.set(
      run.id,
      clone(run),
    );

    try {
      await this.persist();
    } catch (error) {
      this.runs.delete(run.id);
      throw error;
    }
  }

  private async persist(): Promise<void> {
    const path =
      resolve(this.storePath);

    await mkdir(
      dirname(path),
      {
        recursive: true,
      },
    );

    const temporaryPath =
      `${path}.${process.pid}.${randomUUID()}.tmp`;

    const payload:
      MemoryToActionEvaluationStoreFile = {
      version:
        STORE_VERSION,
      runs:
        this.list(),
    };

    try {
      await writeFile(
        temporaryPath,
        `${JSON.stringify(payload, null, 2)}\n`,
        {
          encoding: "utf8",
          mode: 0o600,
        },
      );

      await rename(
        temporaryPath,
        path,
      );
    } catch (error) {
      await rm(
        temporaryPath,
        {
          force: true,
        },
      ).catch(() => undefined);

      throw new Error(
        `K.I.N.G.S. Memory-to-Action Evaluation Journal: failed to persist evaluation state: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private requireInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        "K.I.N.G.S. Memory-to-Action Evaluation Journal: initialize() must complete before use.",
      );
    }
  }
}

export class MemoryToActionEvaluationHarness {
  constructor(
    private readonly journal:
      MemoryToActionEvaluationJournal,

    private readonly evidenceStore:
      EvidenceStore,

    private readonly evaluator:
      MemoryToActionEvaluationAuthority =
        new MemoryToActionEvaluationAuthority(),
  ) {}

  restoreEvidence(
    runId?: string,
  ): number {
    const runs =
      runId
        ? [
            this.journal.get(
              runId,
            ),
          ]
        : this.journal.list();

    if (
      runId &&
      !runs[0]
    ) {
      throw new Error(
        `K.I.N.G.S. Memory-to-Action Evaluation Harness: run "${runId}" was not found.`,
      );
    }

    const retainedRuns =
      runs.filter(
        (
          run,
        ): run is MemoryToActionEvaluationRun =>
          Boolean(run),
      );

    const evidence =
      retainedRuns.flatMap(
        (run) =>
          run.records.map(
            createMemoryToActionCompletionEvidence,
          ),
      );

    const missing =
      evidence.filter(
        (item) => {
          const existing =
            this.evidenceStore.get(
              item.id,
            );

          if (
            existing &&
            !isDeepStrictEqual(
              existing,
              item,
            )
          ) {
            throw new Error(
              `K.I.N.G.S. Memory-to-Action Evaluation Harness: evidence id collision for "${item.id}".`,
            );
          }

          return !existing;
        },
      );

    for (const item of missing) {
      this.evidenceStore.register(
        item,
      );
    }

    return missing.length;
  }

  async run(
    scenarios:
      readonly MemoryToActionEvaluationScenario[],
    options: {
      runId: string;
      createdAt: string;
    },
  ): Promise<MemoryToActionEvaluationRun> {
    if (!String(options.runId ?? "").trim()) {
      throw new Error(
        "K.I.N.G.S. Memory-to-Action Evaluation Harness: run id is required.",
      );
    }

    if (
      !Number.isFinite(
        Date.parse(options.createdAt),
      )
    ) {
      throw new Error(
        "K.I.N.G.S. Memory-to-Action Evaluation Harness: createdAt must be a valid timestamp.",
      );
    }

    if (scenarios.length === 0) {
      throw new Error(
        "K.I.N.G.S. Memory-to-Action Evaluation Harness: at least one scenario is required.",
      );
    }

    const scenarioIds =
      scenarios.map(
        (scenario) =>
          scenario.expectation.scenarioId,
      );

    if (
      scenarioIds.some(
        (id) => !String(id ?? "").trim(),
      ) ||
      new Set(scenarioIds).size !==
        scenarioIds.length
    ) {
      throw new Error(
        "K.I.N.G.S. Memory-to-Action Evaluation Harness: scenario ids must be non-empty and unique.",
      );
    }

    if (this.journal.has(options.runId)) {
      throw new Error(
        `K.I.N.G.S. Memory-to-Action Evaluation Harness: run "${options.runId}" already exists.`,
      );
    }

    const evidenceIds =
      scenarioIds.map(
        (scenarioId) =>
          `EVIDENCE:MEMORY-TO-ACTION:${options.runId}:${scenarioId}`,
      );

    if (
      evidenceIds.some(
        (evidenceId) =>
          this.evidenceStore.has(evidenceId),
      )
    ) {
      throw new Error(
        `K.I.N.G.S. Memory-to-Action Evaluation Harness: completion evidence for run "${options.runId}" already exists.`,
      );
    }

    const records:
      MemoryToActionEvaluationRecord[] = [];

    for (const scenario of scenarios) {
      const execution =
        await scenario.execute();

      records.push(
        this.evaluator.evaluate({
          runId:
            options.runId,
          createdAt:
            options.createdAt,
          expectation:
            scenario.expectation,
          memoryExecution:
            execution.memoryExecution,
          observation:
            execution.observation,
        }),
      );
    }

    const summary =
      summarize(records);

    const run:
      MemoryToActionEvaluationRun = {
      id:
        options.runId,
      passed:
        records.every(
          (record) => record.passed,
        ),
      summary,
      records:
        records.map(clone),
      createdAt:
        options.createdAt,
    };

    await this.journal.record(run);

    for (const record of records) {
      this.evidenceStore.register(
        createMemoryToActionCompletionEvidence(
          record,
        ),
      );
    }

    return clone(run);
  }
}

function summarize(
  records: readonly MemoryToActionEvaluationRecord[],
): MemoryToActionEvaluationSummary {
  const names:
    MemoryToActionStageName[] = [
      "retrieval",
      "constraint-recognition",
      "tool-selection",
      "parameter-grounding",
    ];

  const passedScenarios =
    records.filter(
      (record) => record.passed,
    ).length;

  const stageScores =
    Object.fromEntries(
      names.map(
        (name) => [
          name,
          records.reduce(
            (total, record) =>
              total +
              record.stages[name].score,
            0,
          ) /
          records.length,
        ],
      ),
    ) as Record<
      MemoryToActionStageName,
      number
    >;

  return {
    totalScenarios:
      records.length,
    passedScenarios,
    failedScenarios:
      records.length -
      passedScenarios,
    passRate:
      passedScenarios /
      records.length,
    stageScores,
  };
}

function assertStoredRun(
  run: MemoryToActionEvaluationRun,
): void {
  if (
    !run ||
    typeof run !== "object" ||
    !String(run.id ?? "").trim() ||
    !Number.isFinite(
      Date.parse(run.createdAt),
    ) ||
    !Array.isArray(run.records) ||
    run.records.length === 0 ||
    !run.summary ||
    typeof run.summary !== "object"
  ) {
    throw new Error(
      "evaluation run is missing required fields",
    );
  }

  if (
    run.records.some(
      (record) =>
        !record ||
        typeof record !== "object" ||
        record.runId !== run.id ||
        !String(record.id ?? "").trim() ||
        !String(record.scenarioId ?? "").trim() ||
        !record.stages,
    )
  ) {
    throw new Error(
      `evaluation run "${run.id}" contains an invalid record`,
    );
  }

  const stageNames:
    MemoryToActionStageName[] = [
      "retrieval",
      "constraint-recognition",
      "tool-selection",
      "parameter-grounding",
    ];

  for (const record of run.records) {
    if (
      !String(record.taskId ?? "").trim() ||
      !String(record.missionId ?? "").trim() ||
      record.id !==
        `MEMORY-TO-ACTION:${run.id}:${record.scenarioId}` ||
      record.createdAt !== run.createdAt ||
      typeof record.passed !== "boolean" ||
      !isUnitScore(record.score) ||
      !isUniqueStringArray(
        record.selectedMemoryIds,
      ) ||
      !isUniqueStringArray(
        record.usedMemoryIds,
      ) ||
      !isUniqueStringArray(
        record.retrievedButUnusedMemoryIds,
      )
    ) {
      throw new Error(
        `evaluation run "${run.id}" contains a malformed record`,
      );
    }

    const selected =
      new Set(
        record.selectedMemoryIds,
      );

    if (
      record.usedMemoryIds.some(
        (memoryId) =>
          !selected.has(memoryId),
      ) ||
      record.retrievedButUnusedMemoryIds.some(
        (memoryId) =>
          !selected.has(memoryId) ||
          record.usedMemoryIds.includes(
            memoryId,
          ),
      ) ||
      record.usedMemoryIds.length +
        record.retrievedButUnusedMemoryIds.length !==
        record.selectedMemoryIds.length
    ) {
      throw new Error(
        `evaluation run "${run.id}" contains inconsistent memory-use attribution`,
      );
    }

    for (const name of stageNames) {
      const stage =
        record.stages[name];

      if (
        !stage ||
        stage.name !== name ||
        typeof stage.passed !== "boolean" ||
        !isUnitScore(stage.score) ||
        !Number.isInteger(
          stage.successfulChecks,
        ) ||
        !Number.isInteger(
          stage.totalChecks,
        ) ||
        stage.successfulChecks < 0 ||
        stage.totalChecks < 0 ||
        stage.successfulChecks >
          stage.totalChecks ||
        !Array.isArray(stage.reasons) ||
        stage.reasons.some(
          (reason) =>
            typeof reason !== "string",
        )
      ) {
        throw new Error(
          `evaluation run "${run.id}" contains an invalid "${name}" stage`,
        );
      }

      const expectedScore =
        stage.totalChecks === 0
          ? 1
          : stage.successfulChecks /
            stage.totalChecks;

      const expectedPass =
        stage.successfulChecks ===
          stage.totalChecks &&
        stage.reasons.length === 0;

      if (
        stage.score !== expectedScore ||
        stage.passed !== expectedPass
      ) {
        throw new Error(
          `evaluation run "${run.id}" contains inconsistent "${name}" results`,
        );
      }
    }

    const stageValues =
      stageNames.map(
        (name) =>
          record.stages[name],
      );

    const expectedScore =
      stageValues.reduce(
        (total, stage) =>
          total + stage.score,
        0,
      ) /
      stageValues.length;

    if (
      record.passed !==
        stageValues.every(
          (stage) => stage.passed,
        ) ||
      record.score !== expectedScore
    ) {
      throw new Error(
        `evaluation run "${run.id}" contains an inconsistent aggregate result`,
      );
    }
  }

  const scenarioIds =
    run.records.map(
      (record) => record.scenarioId,
    );

  if (
    new Set(scenarioIds).size !==
      scenarioIds.length
  ) {
    throw new Error(
      `evaluation run "${run.id}" contains duplicate scenarios`,
    );
  }

  const expectedSummary =
    summarize(run.records);

  if (
    typeof run.passed !== "boolean" ||
    run.passed !==
      run.records.every(
        (record) => record.passed,
      ) ||
    !isDeepStrictEqual(
      run.summary,
      expectedSummary,
    )
  ) {
    throw new Error(
      `evaluation run "${run.id}" contains an inconsistent summary`,
    );
  }
}

function isUnitScore(
  value: unknown,
): value is number {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1;
}

function isUniqueStringArray(
  value: unknown,
): value is string[] {
  return Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "string" &&
        item.trim().length > 0,
    ) &&
    new Set(value).size ===
      value.length;
}

function clone<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value),
  ) as T;
}
