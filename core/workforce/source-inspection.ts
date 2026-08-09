import type {
  ID,
  KnowledgeSource,
  KnowledgeSourceType,
} from "./types";

export type InspectionOperation =
  | "metadata"
  | "content";

export interface SourceInspectionPolicy {
  projectRoot: string;
  allowedSourceIds: ID[];
  allowedSourceTypes: KnowledgeSourceType[];
  allowedOperations: InspectionOperation[];
  excludedPathSegments: string[];
}

export interface SourceInspectionRequest {
  sourceId: ID;
  operation: InspectionOperation;
  relativePath?: string;
}

export interface SourceInspectionResult {
  sourceId: ID;
  operation: InspectionOperation;
  path: string;
  content?: string;
  sizeBytes: number;
  createdAt: string;
}

export class SourceInspectionPolicyError extends Error {
  constructor(message: string) {
    super(
      `K.I.N.G.S. Source Inspector: ${message}`,
    );
    this.name = "SourceInspectionPolicyError";
  }
}

export function validateInspectionPolicy(
  source: KnowledgeSource,
  policy: SourceInspectionPolicy,
): void {
  if (!policy.allowedSourceIds.includes(source.id)) {
    throw new SourceInspectionPolicyError(
      `source "${source.id}" is not authorized for inspection`,
    );
  }

  if (!policy.allowedSourceTypes.includes(source.type)) {
    throw new SourceInspectionPolicyError(
      `source type "${source.type}" is not authorized for inspection`,
    );
  }

  if (!policy.allowedOperations.includes("metadata")) {
    throw new SourceInspectionPolicyError(
      "metadata inspection is not authorized",
    );
  }

  if (policy.projectRoot.trim().length === 0) {
    throw new SourceInspectionPolicyError(
      "project root cannot be empty",
    );
  }

  if (policy.excludedPathSegments.length === 0) {
    throw new SourceInspectionPolicyError(
      "inspection policy must define excluded path segments",
    );
  }
}

export function validateInspectionRequest(
  source: KnowledgeSource,
  request: SourceInspectionRequest,
  policy: SourceInspectionPolicy,
): void {
  validateInspectionPolicy(source, policy);

  if (request.sourceId !== source.id) {
    throw new SourceInspectionPolicyError(
      `request source "${request.sourceId}" does not match source "${source.id}"`,
    );
  }

  if (!policy.allowedOperations.includes(request.operation)) {
    throw new SourceInspectionPolicyError(
      `operation "${request.operation}" is not authorized`,
    );
  }

  if (request.relativePath) {
    const normalized = request.relativePath.replaceAll("\\", "/");

    if (
      normalized.startsWith("/") ||
      normalized.split("/").includes("..")
    ) {
      throw new SourceInspectionPolicyError(
        `path "${request.relativePath}" escapes the approved project root`,
      );
    }

    for (const excluded of policy.excludedPathSegments) {
      if (
        normalized === excluded ||
        normalized.startsWith(`${excluded}/`) ||
        normalized.includes(`/${excluded}/`)
      ) {
        throw new SourceInspectionPolicyError(
          `path "${request.relativePath}" contains excluded path segment "${excluded}"`,
        );
      }
    }
  }
}
