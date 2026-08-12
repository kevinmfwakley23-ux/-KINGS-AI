import type { ID } from "../types";
import type { ToolExecutionRequest } from "../tool-gateway";
import {
  WEB_ACCESS_TOOL_ID,
  WebAccessAdapter,
} from "../web-access";

export const EXTERNAL_RESEARCH_TOOL_ID =
  "tool-external-research";

export type ResearchFindingKind =
  | "observation"
  | "source-supported-claim"
  | "inference";

export interface ResearchSourceRecord {
  sourceId: ID;
  requestedUrl: string;
  finalUrl: string;
  status: number;
  statusText: string;
  contentType: string;
  retrievedAt: string;
}

export interface ResearchFinding {
  findingId: ID;
  sourceId: ID;
  kind: ResearchFindingKind;
  statement: string;
  confidence: "low" | "medium" | "high";
}

export interface ExternalResearchRequest {
  researchId: ID;
  taskId: ID;
  question: string;
  urls: string[];
  maxSources: number;
}

export interface ExternalResearchResult {
  researchId: ID;
  taskId: ID;
  question: string;
  sources: ResearchSourceRecord[];
  findings: ResearchFinding[];
  completedAt: string;
}

export interface ExternalResearchAuthorizer {
  authorize(
    request: ExternalResearchRequest,
  ): void;
}

export class ExternalResearchAuthorizationError
  extends Error {
  constructor(message: string) {
    super(
      `K.I.N.G.S. External Research: ${message}`,
    );
    this.name =
      "ExternalResearchAuthorizationError";
  }
}

export class ExternalResearchAdapter {
  readonly toolId =
    EXTERNAL_RESEARCH_TOOL_ID;

  constructor(
    private readonly webAccess: WebAccessAdapter,
    private readonly authorizer: ExternalResearchAuthorizer,
  ) {}

  async execute(
    request: ToolExecutionRequest,
  ): Promise<ExternalResearchResult> {
    const input =
      this.parseRequest(request);

    this.authorizer.authorize(input);

    const uniqueUrls =
      [...new Set(input.urls)];

    if (
      uniqueUrls.length === 0
    ) {
      throw new ExternalResearchAuthorizationError(
        "at least one research URL is required",
      );
    }

    if (
      uniqueUrls.length >
      input.maxSources
    ) {
      throw new ExternalResearchAuthorizationError(
        `research source count exceeds configured maximum of ${input.maxSources}`,
      );
    }

    const sources: ResearchSourceRecord[] = [];

    for (
      const url of uniqueUrls
    ) {
      const result =
        await this.webAccess.execute({
          requestId:
            `${input.researchId}:${url}`,
          taskId:
            input.taskId,
          agentId:
            "external-research",
          toolId:
            WEB_ACCESS_TOOL_ID,
          arguments: {
            url,
            method: "GET",
          },
        }) as {
          url: string;
          finalUrl: string;
          status: number;
          statusText: string;
          contentType: string;
          fetchedAt: string;
        };

      sources.push({
        sourceId:
          `${input.researchId}:source:${sources.length + 1}`,
        requestedUrl:
          result.url,
        finalUrl:
          result.finalUrl,
        status:
          result.status,
        statusText:
          result.statusText,
        contentType:
          result.contentType,
        retrievedAt:
          result.fetchedAt,
      });
    }

    return {
      researchId:
        input.researchId,
      taskId:
        input.taskId,
      question:
        input.question,
      sources,
      findings: [],
      completedAt:
        new Date().toISOString(),
    };
  }

  private parseRequest(
    request: ToolExecutionRequest,
  ): ExternalResearchRequest {
    const args =
      request.arguments;

    const researchId =
      args.researchId;

    const question =
      args.question;

    const urls =
      args.urls;

    const maxSources =
      args.maxSources;

    if (
      typeof researchId !==
      "string" ||
      !researchId.trim()
    ) {
      throw new ExternalResearchAuthorizationError(
        "researchId is required",
      );
    }

    if (
      typeof question !==
      "string" ||
      !question.trim()
    ) {
      throw new ExternalResearchAuthorizationError(
        "research question is required",
      );
    }

    if (
      !Array.isArray(urls) ||
      urls.length === 0 ||
      urls.some(
        (url) =>
          typeof url !==
          "string" ||
          !url.trim(),
      )
    ) {
      throw new ExternalResearchAuthorizationError(
        "urls must contain at least one non-empty URL",
      );
    }

    if (
      typeof maxSources !==
        "number" ||
      !Number.isInteger(
        maxSources,
      ) ||
      maxSources < 1
    ) {
      throw new ExternalResearchAuthorizationError(
        "maxSources must be a positive integer",
      );
    }

    return {
      researchId:
        researchId.trim(),
      taskId:
        request.taskId,
      question:
        question.trim(),
      urls,
      maxSources,
    };
  }
}

export class ApprovedExternalResearchAuthorizer
  implements ExternalResearchAuthorizer {
  constructor(
    private readonly approvedTaskIds:
      Set<ID>,
  ) {}

  authorize(
    request: ExternalResearchRequest,
  ): void {
    if (
      !this.approvedTaskIds.has(
        request.taskId,
      )
    ) {
      throw new ExternalResearchAuthorizationError(
        `task "${request.taskId}" is not authorized for external research`,
      );
    }
  }
}
