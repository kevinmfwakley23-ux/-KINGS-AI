import type { ID } from "../types";
import type {
  ExternalResearchAuthorizer,
  ExternalResearchRequest,
} from "./external-research";

export interface ProjectOwnerResearchApproval {
  approvalId: ID;
  ownerId: ID;
  projectId: ID;
  taskId: ID;
  researchId: ID;
  question: string;
  allowedHosts: string[];
  approvedAt: string;
  expiresAt: string;
  reason: string;
}

export interface ProjectOwnerResearchPolicy {
  ownerId: ID;
  projectId: ID;
  approvalRequired: boolean;
  allowedHosts: string[];
  maxSources: number;
  maxDurationMs: number;
}

export class ProjectOwnerResearchPolicyError extends Error {
  constructor(message: string) {
    super(`K.I.N.G.S. Project Owner Research Policy: ${message}`);
    this.name = "ProjectOwnerResearchPolicyError";
  }
}

export class ProjectOwnerResearchPolicyAuthority
  implements ExternalResearchAuthorizer {
  private readonly approvals = new Map<ID, ProjectOwnerResearchApproval>();

  constructor(
    private readonly policy: ProjectOwnerResearchPolicy,
  ) {
    if (!policy.ownerId.trim()) {
      throw new ProjectOwnerResearchPolicyError(
        "ownerId is required",
      );
    }

    if (!policy.projectId.trim()) {
      throw new ProjectOwnerResearchPolicyError(
        "projectId is required",
      );
    }

    if (policy.maxSources < 1) {
      throw new ProjectOwnerResearchPolicyError(
        "maxSources must be positive",
      );
    }

    if (policy.maxDurationMs < 1) {
      throw new ProjectOwnerResearchPolicyError(
        "maxDurationMs must be positive",
      );
    }
  }

  approve(
    approval: ProjectOwnerResearchApproval,
  ): void {
    this.assertOwner(approval.ownerId);

    if (approval.projectId !== this.policy.projectId) {
      throw new ProjectOwnerResearchPolicyError(
        "approval project does not match the configured project",
      );
    }

    if (!approval.taskId.trim()) {
      throw new ProjectOwnerResearchPolicyError(
        "approval taskId is required",
      );
    }

    if (!approval.researchId.trim()) {
      throw new ProjectOwnerResearchPolicyError(
        "approval researchId is required",
      );
    }

    if (!approval.question.trim()) {
      throw new ProjectOwnerResearchPolicyError(
        "approval question is required",
      );
    }

    if (approval.allowedHosts.length === 0) {
      throw new ProjectOwnerResearchPolicyError(
        "approval must authorize at least one host",
      );
    }

    const approvedAt = Date.parse(approval.approvedAt);
    const expiresAt = Date.parse(approval.expiresAt);

    if (!Number.isFinite(approvedAt) || !Number.isFinite(expiresAt)) {
      throw new ProjectOwnerResearchPolicyError(
        "approval timestamps must be valid ISO timestamps",
      );
    }

    if (expiresAt <= approvedAt) {
      throw new ProjectOwnerResearchPolicyError(
        "approval must expire after approval time",
      );
    }

    const duration = expiresAt - approvedAt;
    if (duration > this.policy.maxDurationMs) {
      throw new ProjectOwnerResearchPolicyError(
        "approval exceeds the configured maximum duration",
      );
    }

    const approvedHosts = approval.allowedHosts.map((host) =>
      host.trim().toLowerCase().replace(/\.$/, ""),
    );

    for (const host of approvedHosts) {
      if (
        !this.policy.allowedHosts.some(
          (allowed) =>
            host === allowed.trim().toLowerCase().replace(/\.$/, "") ||
            host.endsWith(`.${allowed.trim().toLowerCase().replace(/\.$/, "")}`),
        )
      ) {
        throw new ProjectOwnerResearchPolicyError(
          `host "${host}" is outside the configured project-owner research policy`,
        );
      }
    }

    this.approvals.set(
      approval.approvalId,
      {
        ...approval,
        allowedHosts: approvedHosts,
      },
    );
  }

  revoke(
    approvalId: ID,
    ownerId: ID,
  ): void {
    this.assertOwner(ownerId);

    if (!this.approvals.delete(approvalId)) {
      throw new ProjectOwnerResearchPolicyError(
        `approval "${approvalId}" does not exist`,
      );
    }
  }

  authorize(
    request: ExternalResearchRequest,
  ): void {
    if (!this.policy.approvalRequired) {
      this.authorizeAgainstPolicy(request);
      return;
    }

    const approval = this.findApproval(request);

    if (!approval) {
      throw new ProjectOwnerResearchPolicyError(
        `research request "${request.researchId}" has no valid Project Owner approval`,
      );
    }

    const now = Date.now();
    const expiresAt = Date.parse(approval.expiresAt);

    if (now >= expiresAt) {
      throw new ProjectOwnerResearchPolicyError(
        `research approval "${approval.approvalId}" has expired`,
      );
    }

    if (approval.question !== request.question.trim()) {
      throw new ProjectOwnerResearchPolicyError(
        "research question does not match the approved scope",
      );
    }

    if (request.maxSources > this.policy.maxSources) {
      throw new ProjectOwnerResearchPolicyError(
        "requested source limit exceeds project-owner policy",
      );
    }

    this.authorizeAgainstHosts(request, approval.allowedHosts);
  }

  listApprovals(): ProjectOwnerResearchApproval[] {
    return [...this.approvals.values()].map((approval) => ({
      ...approval,
      allowedHosts: [...approval.allowedHosts],
    }));
  }

  private findApproval(
    request: ExternalResearchRequest,
  ): ProjectOwnerResearchApproval | undefined {
    return [...this.approvals.values()].find(
      (approval) =>
        approval.ownerId === this.policy.ownerId &&
        approval.projectId === this.policy.projectId &&
        approval.taskId === request.taskId &&
        approval.researchId === request.researchId,
    );
  }

  private authorizeAgainstPolicy(
    request: ExternalResearchRequest,
  ): void {
    if (request.maxSources > this.policy.maxSources) {
      throw new ProjectOwnerResearchPolicyError(
        "requested source limit exceeds project-owner policy",
      );
    }

    this.authorizeAgainstHosts(
      request,
      this.policy.allowedHosts,
    );
  }

  private authorizeAgainstHosts(
    request: ExternalResearchRequest,
    allowedHosts: string[],
  ): void {
    for (const rawUrl of request.urls) {
      let host: string;

      try {
        host = new URL(rawUrl).hostname
          .toLowerCase()
          .replace(/\.$/, "");
      } catch {
        throw new ProjectOwnerResearchPolicyError(
          `invalid research URL "${rawUrl}"`,
        );
      }

      const allowed = allowedHosts.some((candidate) => {
        const normalized = candidate
          .trim()
          .toLowerCase()
          .replace(/\.$/, "");

        return host === normalized || host.endsWith(`.${normalized}`);
      });

      if (!allowed) {
        throw new ProjectOwnerResearchPolicyError(
          `research host "${host}" is outside the authorized scope`,
        );
      }
    }
  }

  private assertOwner(
    ownerId: ID,
  ): void {
    if (ownerId !== this.policy.ownerId) {
      throw new ProjectOwnerResearchPolicyError(
        "caller is not the configured Project Owner",
      );
    }
  }
}
