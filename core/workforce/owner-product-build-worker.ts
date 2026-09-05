import { isAbsolute, resolve } from "node:path";

import type { AppAiRouteRequest, AppAiRouteResult, AppAiRouteSuccess } from "./app-ai-router";
import type { IntelligenceCapability, ModelExecutionRequest, ModelExecutionResult } from "./model-interface";
import type { KnowledgeSource, Task, WorkforceResult } from "./types";
import type { ProductBuildWorkerContext, ProductBuildWorkerRunResult, ProductBuildWorkerRunner } from "./product-build-worker-runner";
import { OwnerMissionRuntime } from "./owner-mission-runtime";
import { RepositoryInspector } from "./repository-inspector";
import { GovernedLocalCodingProposal } from "./local-coding-change-proposal";
import { LocalCodingJsonProposalParser } from "./local-coding-json-proposal-parser";
import { ControlledFileEditor } from "./file-editor";
import { LocalProjectEngineeringReadinessAuthority } from "./local-project-engineering-readiness";
import { LocalEngineeringExecutionRunner, type LocalEngineeringExecutionReport } from "./local-engineering-execution-runner";

const MAX_MODEL_CONTEXT_CHARS = 240_000;
const MAX_CONTEXT_FILES = 18;
const MAX_FILE_BYTES = 128 * 1024;
const MAX_WRITE_BYTES = 512 * 1024;
const SOURCE_ID = "owner-engineering-workspace";

export interface OwnerProductBuildRouter {
  route(request: AppAiRouteRequest): Promise<AppAiRouteResult>;
}

interface FileSnapshot {
  path: string;
  existed: boolean;
  content?: string;
}

interface ValidationOutcome {
  ok: boolean;
  report?: LocalEngineeringExecutionReport;
  reason?: string;
  references: string[];
}

/**
 * Production ProductBuildWorkerRunner for owner-created missions.
 *
 * It deliberately reuses the existing AppAiRouter, repository inspector,
 * governed coding proposal parser/path authority, ControlledFileEditor, local
 * readiness authority and local engineering execution runner. It does not give
 * a model a shell or raw filesystem handle.
 */
export class OwnerProductBuildWorker implements ProductBuildWorkerRunner {
  private readonly root: string;
  private readonly inspector: RepositoryInspector;
  private readonly editor: ControlledFileEditor;
  private readonly readiness = new LocalProjectEngineeringReadinessAuthority();
  private readonly execution = new LocalEngineeringExecutionRunner();
  private readonly proposalAuthority = new GovernedLocalCodingProposal();
  private readonly proposalParser = new LocalCodingJsonProposalParser();
  private readonly source: KnowledgeSource;

  constructor(
    private readonly missions: OwnerMissionRuntime,
    private readonly router: OwnerProductBuildRouter,
    workspaceRoot: string,
  ) {
    if (!String(workspaceRoot ?? "").trim()) {
      throw new Error("K.I.N.G.S. Owner Product Worker: workspace root is required.");
    }
    this.root = resolve(workspaceRoot);
    const now = new Date().toISOString();
    this.source = {
      id: SOURCE_ID,
      type: "repository",
      name: "Owner engineering workspace",
      description: "Server-configured repository authorized for the current owner engineering runtime.",
      location: this.root,
      authoritative: true,
      createdAt: now,
      updatedAt: now,
    };
    this.inspector = new RepositoryInspector({
      projectRoot: this.root,
      allowedSourceIds: [SOURCE_ID],
      allowedSourceTypes: ["repository"],
      allowedOperations: ["metadata", "content"],
      excludedPathSegments: [
        ".git", "node_modules", "build", "dist", "coverage", ".next", ".turbo", ".kings",
      ],
      maxFiles: 1200,
      maxFileBytes: MAX_FILE_BYTES,
      inspectExtensions: [
        ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".html", ".css",
        ".py", ".rs", ".go", ".java", ".md", ".yaml", ".yml",
      ],
    });
    this.editor = new ControlledFileEditor({
      allowedReadPaths: [this.root],
      allowedWritePaths: [this.root],
      maxFileBytes: MAX_WRITE_BYTES,
    });
  }

  async run(context: ProductBuildWorkerContext): Promise<ProductBuildWorkerRunResult> {
    const task = this.missions.getTask(context.dispatch.taskId);
    if (!task) {
      return { completed: false, result: this.failure(context, "Dispatched owner task was not found.") };
    }
    if (task.missionId !== context.dispatch.missionId || task.assignedAgentId !== context.dispatch.agentId) {
      return { completed: false, result: this.failure(context, "Dispatched owner task identity is inconsistent.") };
    }

    if (task.requiredCapabilities.includes("testing")) {
      return this.runVerificationTask(context, task);
    }
    if (task.requiredCapabilities.includes("coding")) {
      if (task.id.endsWith("-hardening") || task.id.endsWith("-release")) {
        const verified = await this.validate(task, ["build", "test"]);
        if (verified.ok) {
          return {
            completed: true,
            result: this.success(
              context,
              `Repository-native build and test verification is green for ${task.name}. No speculative code change was required.`,
              verified.references,
            ),
          };
        }
        return this.runCodingTask(context, task, ["build", "test"], verified.reason);
      }
      return this.runCodingTask(
        context,
        task,
        task.id.endsWith("-integration") ? ["build", "test"] : ["build"],
      );
    }
    return this.runIntelligenceTask(context, task);
  }

  private async runIntelligenceTask(
    context: ProductBuildWorkerContext,
    task: Task,
  ): Promise<ProductBuildWorkerRunResult> {
    const mission = this.missions.snapshot(task.missionId);
    const owner = this.missions.getMissionContext(task.missionId);
    const prior = mission.results
      .filter((result) => result.status === "success")
      .map((result) => `${result.taskId}: ${result.summary}`)
      .join("\n\n")
      .slice(-80_000);
    const documents = owner.contextDocuments
      .map((document) => `${document.name} [sha256=${document.sha256}]\n${document.text}`)
      .join("\n\n")
      .slice(0, 120_000);
    const capabilities = intelligenceCapabilities(task);
    const routed = await this.router.route({
      appId: "kings.ai",
      messages: [
        {
          role: "system",
          content: [
            "You are a K.I.N.G.S. owner-mission workforce specialist.",
            "Work only on the dispatched task. Be concrete, technical, and truthful.",
            "Do not claim repository edits or tests unless the execution runtime actually performed them.",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            `MISSION: ${mission.mission.name}`,
            `OWNER VISION: ${owner.ownerVision}`,
            `TASK: ${task.name}`,
            `TASK DESCRIPTION: ${task.description}`,
            `EXPECTED OUTPUTS: ${task.expectedOutputs.join(", ")}`,
            documents ? `OWNER CONTEXT:\n${documents}` : "",
            prior ? `PRIOR VERIFIED WORKFORCE RESULTS:\n${prior}` : "",
          ].filter(Boolean).join("\n\n"),
        },
      ],
      requiredCapabilities: capabilities,
      maxOutputTokens: 8_000,
      temperature: 0.15,
      allowToolProposals: false,
    });
    if (!routed.success) {
      return { completed: false, result: this.routeFailure(context, routed) };
    }
    return {
      completed: true,
      result: this.success(
        context,
        routed.content,
        routeReferences(routed),
      ),
    };
  }

  private async runCodingTask(
    context: ProductBuildWorkerContext,
    task: Task,
    operations: Array<"build" | "test">,
    priorFailure?: string,
  ): Promise<ProductBuildWorkerRunResult> {
    const repositoryContext = await this.repositoryContext();
    const mission = this.missions.snapshot(task.missionId);
    const owner = this.missions.getMissionContext(task.missionId);
    const prior = mission.results
      .filter((result) => result.status === "success")
      .map((result) => `${result.taskId}: ${result.summary}`)
      .join("\n\n")
      .slice(-70_000);

    const system = [
      "You are the K.I.N.G.S. governed repository coding worker.",
      "Return exactly one JSON object and no commentary.",
      "Schema: {\"id\":string,\"taskId\":string,\"missionId\":string,\"summary\":string,\"changes\":[{\"path\":string,\"operation\":\"create\"|\"replace\",\"content\":string}]}",
      `taskId MUST equal ${task.id}`,
      `missionId MUST equal ${task.missionId}`,
      "Every path must be repository-relative. Never use traversal or absolute paths.",
      "Use create only for a new file and replace only for an existing file.",
      "Do not output shell commands. Do not modify dependency lockfiles unless the task explicitly requires it.",
      "Make the smallest coherent change that advances the approved owner vision and keeps the repository buildable.",
    ].join("\n");

    const user = [
      `OWNER VISION:\n${owner.ownerVision}`,
      `DISPATCHED TASK:\n${task.name}\n${task.description}`,
      `EXPECTED OUTPUTS: ${task.expectedOutputs.join(", ")}`,
      priorFailure ? `CURRENT VERIFIED FAILURE TO REPAIR:\n${priorFailure}` : "",
      prior ? `PRIOR WORKFORCE RESULTS:\n${prior}` : "",
      `AUTHORIZED REPOSITORY CONTEXT:\n${repositoryContext}`,
    ].filter(Boolean).join("\n\n");

    const routeRequest: AppAiRouteRequest = {
      appId: "kings.ai",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      requiredCapabilities: ["coding", "reasoning", "structured-output"],
      maxOutputTokens: 16_000,
      temperature: 0,
      requireStructuredOutput: true,
      allowToolProposals: false,
    };

    let routed = await this.router.route(routeRequest);
    if (!routed.success) {
      // The local Ollama adapter intentionally does not advertise structured
      // output. A second strict-JSON prompt may use it only after the primary
      // structured provider route is unavailable or fails.
      routed = await this.router.route({
        ...routeRequest,
        requiredCapabilities: ["coding", "reasoning"],
        requireStructuredOutput: false,
      });
    }
    if (!routed.success) {
      return { completed: false, result: this.routeFailure(context, routed) };
    }

    const request = proposalValidationRequest(task, routed.requestId, system, user);
    let proposal;
    try {
      proposal = this.proposalAuthority.propose(
        {
          response: routeAsModelResult(routed, request),
          request,
          allowedPaths: [this.root],
          workspaceRoot: this.root,
        },
        this.proposalParser,
      );
    } catch (error) {
      return {
        completed: false,
        result: this.failure(
          context,
          `Provider returned an invalid or unauthorized coding proposal: ${error instanceof Error ? error.message : String(error)}`,
          routeReferences(routed),
        ),
      };
    }

    const snapshots: FileSnapshot[] = [];
    try {
      for (const change of proposal.changes) {
        const absolute = this.authorizedAbsolutePath(change.path);
        const existed = await this.editor.exists({ path: absolute });
        if (change.operation === "create" && existed) {
          throw new Error(`create operation refused because "${change.path}" already exists`);
        }
        if (change.operation === "replace" && !existed) {
          throw new Error(`replace operation refused because "${change.path}" does not exist`);
        }
        snapshots.push({
          path: absolute,
          existed,
          ...(existed ? { content: (await this.editor.read({ path: absolute })).content } : {}),
        });
      }

      for (const change of proposal.changes) {
        await this.editor.write({
          path: this.authorizedAbsolutePath(change.path),
          content: change.content,
        });
      }

      const verified = await this.validate(task, operations);
      if (!verified.ok) {
        await this.rollback(snapshots);
        return {
          completed: false,
          result: this.failure(
            context,
            `Governed coding changes were rolled back because repository validation failed: ${verified.reason ?? "unknown validation failure"}`,
            [...routeReferences(routed), ...verified.references, "governed-write-rollback"],
          ),
        };
      }

      return {
        completed: true,
        result: this.success(
          context,
          `${proposal.summary} Changed ${proposal.changes.map((change) => change.path).join(", ")}. Repository validation passed.`,
          [
            ...routeReferences(routed),
            ...verified.references,
            ...proposal.changes.map((change) => `governed-write:${change.path}`),
          ],
        ),
      };
    } catch (error) {
      await this.rollback(snapshots);
      return {
        completed: false,
        result: this.failure(
          context,
          `Governed coding task failed and completed writes were rolled back: ${error instanceof Error ? error.message : String(error)}`,
          [...routeReferences(routed), "governed-write-rollback"],
        ),
      };
    }
  }

  private async runVerificationTask(
    context: ProductBuildWorkerContext,
    task: Task,
  ): Promise<ProductBuildWorkerRunResult> {
    const validation = await this.validate(task, ["build", "test"]);
    if (!validation.ok) {
      return {
        completed: false,
        result: this.failure(
          context,
          validation.reason ?? "Repository-native verification failed.",
          validation.references,
        ),
      };
    }
    return {
      completed: true,
      result: this.success(
        context,
        "Repository-native build and test verification completed successfully with preserved execution evidence.",
        validation.references,
      ),
    };
  }

  private async validate(
    task: Task,
    operations: Array<"build" | "test">,
  ): Promise<ValidationOutcome> {
    try {
      const readiness = await this.readiness.inspect({
        id: task.missionId,
        projectPath: this.root,
        requiredOperations: operations,
        executionId: `owner-validation-${task.id}`,
      });
      if (readiness.execution.status === "blocked") {
        return {
          ok: false,
          reason: readiness.blockedReasons.join(" ") || "Repository engineering readiness is blocked.",
          references: readiness.blockedReasons.map((reason, index) => `readiness-block:${index}:${reason}`),
        };
      }
      const report = this.execution.execute({ readiness, authorized: true });
      const references = report.evidence.map((item) =>
        `repository-${item.operation}:${item.exitCode ?? "none"}:${item.succeeded ? "passed" : "failed"}`,
      );
      if (report.status !== "completed") {
        return {
          ok: false,
          report,
          reason: report.failureReason ?? "Repository validation did not complete.",
          references,
        };
      }
      return { ok: true, report, references };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
        references: ["repository-validation-exception"],
      };
    }
  }

  private async repositoryContext(): Promise<string> {
    const inspection = await this.inspector.inspect(this.source);
    const candidates = inspection.files
      .filter((file) => !file.isDirectory && file.sizeBytes <= MAX_FILE_BYTES)
      .filter((file) => /(?:^|\/)(?:README\.md|package\.json|tsconfig\.json)$|\.(?:ts|tsx|js|jsx|mjs|cjs|json|html|css|py|rs|go|java|md)$/i.test(file.relativePath))
      .sort((left, right) => contextPriority(left.relativePath) - contextPriority(right.relativePath) || left.relativePath.localeCompare(right.relativePath))
      .slice(0, MAX_CONTEXT_FILES);

    const chunks: string[] = [
      `Repository root: ${this.root}`,
      `Visible files (${inspection.files.filter((file) => !file.isDirectory).length} total):`,
      inspection.files.filter((file) => !file.isDirectory).slice(0, 300).map((file) => file.relativePath).join("\n"),
    ];
    let used = chunks.join("\n").length;
    for (const candidate of candidates) {
      const content = await this.inspector.readTextFile(this.source, candidate.relativePath);
      const chunk = `\n--- FILE ${candidate.relativePath} ---\n${content}`;
      if (used + chunk.length > MAX_MODEL_CONTEXT_CHARS) break;
      chunks.push(chunk);
      used += chunk.length;
    }
    return chunks.join("\n").slice(0, MAX_MODEL_CONTEXT_CHARS);
  }

  private authorizedAbsolutePath(relativePath: string): string {
    const absolute = resolve(this.root, relativePath);
    const relative = absolute.slice(this.root.length);
    if (
      absolute !== this.root &&
      (!absolute.startsWith(`${this.root}/`) && !absolute.startsWith(`${this.root}\\`))
    ) {
      throw new Error(`Path "${relativePath}" escapes the configured owner workspace.`);
    }
    if (isAbsolute(relativePath)) {
      throw new Error(`Path "${relativePath}" must be repository-relative.`);
    }
    void relative;
    return absolute;
  }

  private async rollback(snapshots: FileSnapshot[]): Promise<void> {
    const errors: string[] = [];
    for (const snapshot of [...snapshots].reverse()) {
      try {
        if (snapshot.existed) {
          await this.editor.write({ path: snapshot.path, content: snapshot.content ?? "" });
        } else {
          await this.editor.delete({ path: snapshot.path });
        }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    if (errors.length) {
      throw new Error(`Rollback was incomplete: ${errors.join(" | ")}`);
    }
  }

  private success(
    context: ProductBuildWorkerContext,
    summary: string,
    verificationReferences: string[],
  ): WorkforceResult {
    return {
      id: `owner-result-${context.dispatch.taskId}-${Date.now()}`,
      taskId: context.dispatch.taskId,
      agentId: context.dispatch.agentId,
      status: "success",
      summary: summary.slice(0, 120_000),
      artifactIds: [],
      verificationReferences: [...new Set(verificationReferences)],
      createdAt: new Date().toISOString(),
    };
  }

  private failure(
    context: ProductBuildWorkerContext,
    summary: string,
    verificationReferences: string[] = ["owner-product-worker-failure"],
  ): WorkforceResult {
    return {
      id: `owner-result-${context.dispatch.taskId}-${Date.now()}`,
      taskId: context.dispatch.taskId,
      agentId: context.dispatch.agentId,
      status: "failure",
      summary: summary.slice(0, 120_000),
      artifactIds: [],
      verificationReferences: [...new Set(verificationReferences)],
      createdAt: new Date().toISOString(),
    };
  }

  private routeFailure(context: ProductBuildWorkerContext, result: Exclude<AppAiRouteResult, AppAiRouteSuccess>): WorkforceResult {
    return this.failure(
      context,
      `K.I.N.G.S. model routing failed: ${result.code}: ${result.message}`,
      [
        `router-request:${result.requestId}`,
        ...result.attempts.map((attempt) => `router-attempt:${attempt.providerId}:${attempt.modelId}:${attempt.code ?? "failed"}`),
      ],
    );
  }
}

function intelligenceCapabilities(task: Task): IntelligenceCapability[] {
  if (task.requiredCapabilities.includes("research")) return ["research", "reasoning"];
  if (task.requiredCapabilities.includes("architecture")) return ["planning", "reasoning"];
  return ["reasoning"];
}

function contextPriority(path: string): number {
  if (path === "package.json") return 0;
  if (path === "tsconfig.json") return 1;
  if (/^README\.md$/i.test(path)) return 2;
  if (/^(?:src|core|apps|packages)\//.test(path)) return 3;
  if (/\.test\.|-test\.|\.spec\./.test(path)) return 5;
  return 4;
}

function routeReferences(route: AppAiRouteSuccess): string[] {
  return [
    `router-request:${route.requestId}`,
    `provider:${route.providerId}`,
    `model:${route.modelId}`,
    ...route.attempts.map((attempt) =>
      `router-attempt:${attempt.providerId}:${attempt.modelId}:${attempt.success ? "success" : attempt.code ?? "failed"}`,
    ),
  ];
}

function proposalValidationRequest(
  task: Task,
  requestId: string,
  system: string,
  user: string,
): ModelExecutionRequest {
  return {
    id: requestId,
    taskId: task.id,
    missionId: task.missionId,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    requiredCapabilities: ["coding", "reasoning"],
    inputModalities: ["text"],
    outputModality: "text",
    maxOutputTokens: 16_000,
    temperature: 0,
    requireStructuredOutput: false,
    allowToolProposals: false,
  };
}

function routeAsModelResult(
  route: AppAiRouteSuccess,
  request: ModelExecutionRequest,
): ModelExecutionResult {
  const now = new Date().toISOString();
  return {
    success: true,
    response: {
      requestId: request.id,
      model: {
        providerId: route.providerId,
        modelId: route.modelId,
        displayName: `${route.providerId}: ${route.modelId}`,
        providerKind: route.providerId === "ollama-internal" ? "internal-local" : "internal-self-hosted",
        capabilities: request.requiredCapabilities,
        inputModalities: ["text"],
        outputModalities: ["text"],
        contextWindowTokens: 1,
        supportsToolCalling: false,
        supportsStructuredOutput: true,
        available: true,
      },
      content: route.content,
      toolCallProposals: route.toolCallProposals,
      usage: {
        tokensUsed: route.usage.totalTokens,
        iterationsUsed: 1,
        estimatedCost: route.usage.estimatedCost,
        elapsedMs: route.usage.elapsedMs,
        inputTokens: route.usage.inputTokens,
        outputTokens: route.usage.outputTokens,
      },
      metadata: {
        requestId: request.id,
        startedAt: now,
        completedAt: now,
        latencyMs: route.usage.elapsedMs,
      },
    },
  };
}
