import {
  isAbsolute,
  relative,
  resolve,
} from "node:path";

import type {
  EngineeringLanguage,
} from "./engineering-toolchain";

import type {
  EngineeringRepairEdit,
} from "./engineering-repair-editor";

import type {
  EngineeringRepairPlan,
  EngineeringRepairStep,
} from "./engineering-repair-planner";

import type {
  EngineeringWorkspace,
} from "./engineering-workspace";

import {
  ControlledFileEditor,
  type FileEditorPolicy,
} from "./file-editor";

import type {
  IntelligenceModel,
  ModelExecutionRequest,
  ModelExecutionResult,
} from "./model-interface";

import type {
  LocalEngineeringExecutionReport,
} from "./local-engineering-execution-runner";

import type {
  LocalEngineeringRecoveryResult,
} from "./local-engineering-recovery-bridge";

import {
  LocalEngineeringRepairRetestAuthority,
  type LocalEngineeringRepairRetestResult,
} from "./local-engineering-repair-retest";

import type {
  LocalProjectEngineeringReadinessResult,
} from "./local-project-engineering-readiness";

export interface LocalModelRepairCycleRequest {
  initialReadiness: LocalProjectEngineeringReadinessResult;
  failureReport: LocalEngineeringExecutionReport;
  recovery: LocalEngineeringRecoveryResult;
  workspace: EngineeringWorkspace;
  targetPath: string;
  model: IntelligenceModel;
  filePolicy: FileEditorPolicy;
  maxSourceBytes?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  completedAt?: string;
}

export interface LocalModelRepairProposalEvidence {
  requestId: string;
  taskId: string;
  projectId: string;
  targetPath: string;
  providerId: string;
  modelId: string;
  summary: string;
  sourceBytes: number;
  proposedBytes: number;
}

export interface LocalModelRepairCycleResult {
  proposal: LocalModelRepairProposalEvidence;
  recovery: LocalEngineeringRepairRetestResult;
  verified: boolean;
}

interface ParsedRepairProposal {
  summary: string;
  path: string;
  operation: "replace";
  content: string;
}

/**
 * Runs a bounded, model-proposed replacement through K.I.N.G.S.' existing
 * governed repair/retest authority.
 *
 * This is intentionally narrower than general code generation: automated
 * failure repair may replace one explicitly authorized existing source file.
 * New-file creation remains on the separate governed coding-proposal path until
 * create/rollback semantics are proven for autonomous repair.
 */
export class LocalModelRepairCycleAuthority {
  async execute(
    request: LocalModelRepairCycleRequest,
  ): Promise<LocalModelRepairCycleResult> {
    const editStep = validateCycleRequest(request);
    const target = authorizeTarget(
      request.workspace,
      request.targetPath,
    );
    const maxSourceBytes = boundedInteger(
      request.maxSourceBytes ?? 128 * 1024,
      "maxSourceBytes",
      1024,
      1024 * 1024,
    );

    const sourceReader = new ControlledFileEditor({
      allowedReadPaths: absoluteAllowedPaths(request.workspace),
      allowedWritePaths: [],
      maxFileBytes: maxSourceBytes,
    });
    const source = await sourceReader.read({ path: target.absolutePath });

    const modelRequest = buildModelRequest({
      repairPlan: request.recovery.repairPlan,
      editStep,
      diagnostics: request.recovery.diagnosticText,
      projectId: request.initialReadiness.execution.projectId,
      targetPath: target.relativePath,
      language: target.language,
      source: source.content,
      maxOutputTokens: boundedInteger(
        request.maxOutputTokens ?? 4096,
        "maxOutputTokens",
        128,
        32_768,
      ),
      structuredOutput: request.model.identity.supportsStructuredOutput,
    });

    if (!request.model.canHandle(modelRequest)) {
      throw new Error(
        `K.I.N.G.S. Local Model Repair: model "${request.model.identity.modelId}" cannot handle the governed repair request`,
      );
    }

    const modelResult = await request.model.execute(modelRequest);
    const proposal = parseRepairProposal(
      modelResult,
      target.relativePath,
      maxSourceBytes,
    );

    const edit: EngineeringRepairEdit = {
      stepId: editStep.id,
      projectId: request.initialReadiness.execution.projectId,
      path: target.absolutePath,
      content: proposal.content,
    };

    const recovery = await new LocalEngineeringRepairRetestAuthority().execute({
      initialReadiness: request.initialReadiness,
      failureReport: request.failureReport,
      recovery: request.recovery,
      edit,
      filePolicy: request.filePolicy,
      ...(request.timeoutMs === undefined
        ? {}
        : { timeoutMs: request.timeoutMs }),
      ...(request.completedAt === undefined
        ? {}
        : { completedAt: request.completedAt }),
    });

    return {
      proposal: {
        requestId: modelRequest.id,
        taskId: editStep.id,
        projectId: request.initialReadiness.execution.projectId,
        targetPath: target.relativePath,
        providerId: request.model.identity.providerId,
        modelId: request.model.identity.modelId,
        summary: proposal.summary,
        sourceBytes: source.bytes,
        proposedBytes: Buffer.byteLength(proposal.content, "utf8"),
      },
      recovery,
      verified: recovery.verified,
    };
  }
}

function validateCycleRequest(
  request: LocalModelRepairCycleRequest,
): EngineeringRepairStep {
  const projectId = request.initialReadiness.execution.projectId;
  if (request.failureReport.status !== "failed") {
    throw new Error(
      `K.I.N.G.S. Local Model Repair: failed execution evidence is required, received "${request.failureReport.status}"`,
    );
  }
  if (
    request.failureReport.execution.id !==
    request.initialReadiness.execution.id
  ) {
    throw new Error(
      "K.I.N.G.S. Local Model Repair: failure evidence is not bound to initial readiness",
    );
  }
  if (
    request.recovery.repairPlan.projectId !== projectId ||
    request.recovery.analysis.projectId !== projectId ||
    request.recovery.commandResult.projectId !== projectId
  ) {
    throw new Error(
      "K.I.N.G.S. Local Model Repair: project identity diverged across execution and recovery evidence",
    );
  }
  const plan = request.recovery.repairPlan;
  if (!plan.authorized || request.recovery.analysis.action !== "repair") {
    throw new Error(
      "K.I.N.G.S. Local Model Repair: recovery policy has not authorized source repair",
    );
  }
  const editStep = repairEditStep(plan);
  if (!editStep) {
    throw new Error(
      "K.I.N.G.S. Local Model Repair: authorized repair plan contains no edit step",
    );
  }
  if (!request.workspace.active) {
    throw new Error(
      "K.I.N.G.S. Local Model Repair: engineering workspace is inactive",
    );
  }
  if (request.workspace.projectId !== projectId) {
    throw new Error(
      "K.I.N.G.S. Local Model Repair: workspace project does not match recovery project",
    );
  }
  if (!request.recovery.diagnosticText.trim()) {
    throw new Error(
      "K.I.N.G.S. Local Model Repair: verified failure diagnostics are required",
    );
  }
  return editStep;
}

function repairEditStep(
  plan: EngineeringRepairPlan,
): EngineeringRepairStep | undefined {
  return plan.steps.find((step) =>
    step.strategy === "edit" && step.required,
  );
}

function authorizeTarget(
  workspace: EngineeringWorkspace,
  rawPath: string,
): {
  relativePath: string;
  absolutePath: string;
  language: EngineeringLanguage;
} {
  const relativePath = normalizeRelativePath(rawPath);
  if (!relativePath) {
    throw new Error(
      "K.I.N.G.S. Local Model Repair: target path is required",
    );
  }
  if (
    !workspace.allowedPaths.some((allowed) =>
      isWithinRelativePath(relativePath, allowed),
    )
  ) {
    throw new Error(
      `K.I.N.G.S. Local Model Repair: target "${relativePath}" is outside the authorized workspace`,
    );
  }
  const language = inferLanguage(relativePath);
  if (!language || !workspace.allowedLanguages.includes(language)) {
    throw new Error(
      `K.I.N.G.S. Local Model Repair: target language for "${relativePath}" is not authorized`,
    );
  }
  const absolutePath = resolve(workspace.rootPath, relativePath);
  const containment = relative(
    resolve(workspace.rootPath),
    absolutePath,
  );
  if (
    containment.startsWith("..") ||
    isAbsolute(containment)
  ) {
    throw new Error(
      "K.I.N.G.S. Local Model Repair: target path escapes the workspace root",
    );
  }
  return { relativePath, absolutePath, language };
}

function absoluteAllowedPaths(
  workspace: EngineeringWorkspace,
): string[] {
  return workspace.allowedPaths.map((path) =>
    resolve(workspace.rootPath, normalizeRelativePath(path)),
  );
}

function buildModelRequest(
  input: {
    repairPlan: EngineeringRepairPlan;
    editStep: EngineeringRepairStep;
    diagnostics: string;
    projectId: string;
    targetPath: string;
    language: EngineeringLanguage;
    source: string;
    maxOutputTokens: number;
    structuredOutput: boolean;
  },
): ModelExecutionRequest {
  const requestId = `repair-model-${input.editStep.id}`;
  return {
    id: requestId,
    taskId: input.editStep.id,
    missionId: input.projectId,
    messages: [
      {
        role: "system",
        content: [
          "You are the K.I.N.G.S. governed local repair worker.",
          "Return only one JSON object; no markdown fences or commentary.",
          "You may replace only the exact target file provided by K.I.N.G.S.",
          "Do not create files, rename paths, change tests to hide a defect, disable verification, remove assertions, or claim a repair succeeded.",
          "Make the smallest source change that addresses the supplied verified failure evidence.",
          "Preserve unrelated behavior and existing public interfaces unless the diagnostics prove they must change.",
          "JSON schema: {\"summary\":\"why this minimal repair addresses the failure\",\"path\":\"exact/target/path\",\"operation\":\"replace\",\"content\":\"complete replacement file contents\"}",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `PROJECT: ${input.projectId}`,
          `AUTHORIZED REPAIR STEP: ${input.editStep.id}`,
          `TARGET LANGUAGE: ${input.language}`,
          `EXACT TARGET PATH: ${input.targetPath}`,
          "VERIFIED FAILURE EVIDENCE:",
          input.diagnostics,
          "CURRENT TARGET FILE:",
          `--- ${input.targetPath} ---`,
          input.source,
          `--- end ${input.targetPath} ---`,
        ].join("\n\n"),
      },
    ],
    requiredCapabilities: [
      "coding",
      "debugging",
      "recovery",
    ],
    inputModalities: ["text"],
    outputModality: "text",
    maxOutputTokens: input.maxOutputTokens,
    temperature: 0,
    ...(input.structuredOutput
      ? { requireStructuredOutput: true }
      : {}),
    allowToolProposals: false,
  };
}

function parseRepairProposal(
  result: ModelExecutionResult,
  authorizedPath: string,
  maxBytes: number,
): ParsedRepairProposal {
  if (!result.success || !result.response) {
    throw new Error(
      `K.I.N.G.S. Local Model Repair: model execution failed${result.failure?.message ? `: ${result.failure.message}` : ""}`,
    );
  }
  const raw = stripFence(result.response.content);
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(
      "K.I.N.G.S. Local Model Repair: model response was not valid JSON",
    );
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      "K.I.N.G.S. Local Model Repair: model response must be a JSON object",
    );
  }
  const row = value as Record<string, unknown>;
  const summary = requiredText(row.summary, "repair summary", 4000);
  const path = normalizeRelativePath(
    requiredText(row.path, "repair path", 1000),
  );
  if (path !== authorizedPath) {
    throw new Error(
      `K.I.N.G.S. Local Model Repair: model attempted unauthorized path "${path}" instead of "${authorizedPath}"`,
    );
  }
  if (row.operation !== "replace") {
    throw new Error(
      "K.I.N.G.S. Local Model Repair: autonomous failure repair currently authorizes only replace operations",
    );
  }
  const content = requiredText(
    row.content,
    "replacement content",
    maxBytes,
    false,
  );
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > maxBytes) {
    throw new Error(
      `K.I.N.G.S. Local Model Repair: replacement exceeds ${maxBytes} bytes`,
    );
  }
  return {
    summary,
    path,
    operation: "replace",
    content,
  };
}

function stripFence(
  value: string,
): string {
  const trimmed = value.trim();
  return trimmed
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/u, "")
    .trim();
}

function normalizeRelativePath(
  value: string,
): string {
  const normalized = value
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "")
    .replace(/\/+/, "/")
    .trim();
  if (
    !normalized ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//u.test(normalized) ||
    normalized.split("/").some((part) => part === "..")
  ) {
    throw new Error(
      `K.I.N.G.S. Local Model Repair: invalid relative path "${value}"`,
    );
  }
  return normalized;
}

function isWithinRelativePath(
  candidate: string,
  allowed: string,
): boolean {
  const normalizedAllowed = normalizeRelativePath(allowed);
  return candidate === normalizedAllowed ||
    candidate.startsWith(`${normalizedAllowed}/`);
}

function inferLanguage(
  path: string,
): EngineeringLanguage | undefined {
  const lower = path.toLowerCase();
  if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "typescript";
  if (lower.endsWith(".js") || lower.endsWith(".jsx") || lower.endsWith(".mjs") || lower.endsWith(".cjs")) return "javascript";
  if (lower.endsWith(".py")) return "python";
  if (lower.endsWith(".rs")) return "rust";
  if (lower.endsWith(".go")) return "go";
  if (lower.endsWith(".java")) return "java";
  if (lower.endsWith(".c") || lower.endsWith(".h")) return "c";
  if (lower.endsWith(".cpp") || lower.endsWith(".hpp") || lower.endsWith(".cc")) return "cpp";
  if (lower.endsWith(".css")) return "css";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
  if (lower.endsWith(".sql")) return "sql";
  if (lower.endsWith(".sh") || lower.endsWith(".bash")) return "shell";
  return undefined;
}

function requiredText(
  value: unknown,
  label: string,
  maxLength: number,
  trim = true,
): string {
  if (typeof value !== "string") {
    throw new Error(
      `K.I.N.G.S. Local Model Repair: ${label} must be text`,
    );
  }
  const text = trim ? value.trim() : value;
  if (!text.trim()) {
    throw new Error(
      `K.I.N.G.S. Local Model Repair: ${label} is required`,
    );
  }
  if (text.length > maxLength) {
    throw new Error(
      `K.I.N.G.S. Local Model Repair: ${label} exceeds ${maxLength} characters`,
    );
  }
  return text;
}

function boundedInteger(
  value: number,
  label: string,
  min: number,
  max: number,
): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(
      `K.I.N.G.S. Local Model Repair: ${label} must be an integer from ${min} through ${max}`,
    );
  }
  return value;
}
