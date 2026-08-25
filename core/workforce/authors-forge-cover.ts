import type { ID } from "./types";
import type { AuthorForgeProject } from "./authors-forge";

export type KdpCoverFormat = "ebook-front" | "paperback-wrap" | "hardcover-wrap";
export type CoverAssetStatus = "planned" | "generated" | "reviewed" | "approved";

export interface AuthorForgeCoverBrief {
  id: ID;
  projectId: ID;
  format: KdpCoverFormat;
  title: string;
  subtitle?: string;
  authorName: string;
  genre: string;
  trimWidthInches: number;
  trimHeightInches: number;
  bleedInches: number;
  spineWidthInches?: number;
  frontCoverPrompt: string;
  backCoverPrompt?: string;
  visualContinuityRules: string[];
  status: CoverAssetStatus;
  outputPath?: string;
  reviewNotes: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AuthorForgeCoverPackage {
  projectId: ID;
  covers: AuthorForgeCoverBrief[];
  kdpPreparationNotes: string[];
  approvalRequired: boolean;
}

export class AuthorsForgeCoverEngine {
  createCoverBrief(
    project: AuthorForgeProject,
    input: {
      id: ID;
      format: KdpCoverFormat;
      authorName: string;
      trimWidthInches: number;
      trimHeightInches: number;
      spineWidthInches?: number;
      frontCoverPrompt: string;
      backCoverPrompt?: string;
    },
  ): AuthorForgeCoverBrief {
    if (!input.authorName.trim()) {
      throw new Error("Author's Forge cover: author name is required");
    }
    if (input.trimWidthInches <= 0 || input.trimHeightInches <= 0) {
      throw new Error("Author's Forge cover: trim dimensions must be positive");
    }
    if (!input.frontCoverPrompt.trim()) {
      throw new Error("Author's Forge cover: front-cover prompt is required");
    }
    if (input.format !== "ebook-front" && !input.spineWidthInches) {
      throw new Error("Author's Forge cover: print-wrap covers require a spine width");
    }

    const now = new Date().toISOString();
    return {
      id: input.id,
      projectId: project.id,
      format: input.format,
      title: project.manuscript.title,
      subtitle: project.manuscript.subtitle,
      authorName: input.authorName,
      genre: project.manuscript.genre,
      trimWidthInches: input.trimWidthInches,
      trimHeightInches: input.trimHeightInches,
      bleedInches: 0.125,
      spineWidthInches: input.spineWidthInches,
      frontCoverPrompt: input.frontCoverPrompt,
      backCoverPrompt: input.backCoverPrompt,
      visualContinuityRules: [
        ...project.manuscript.styleGuide,
        ...project.manuscript.continuityRules,
        `Preserve the established visual identity for ${project.manuscript.title}.`,
      ],
      status: "planned",
      reviewNotes: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  createKdpPackage(
    project: AuthorForgeProject,
    cover: AuthorForgeCoverBrief,
  ): AuthorForgeCoverPackage {
    if (cover.projectId !== project.id) {
      throw new Error("Author's Forge cover: project mismatch");
    }

    const notes = [
      "Final KDP submission dimensions must be confirmed against the selected trim size, page count, binding, and current KDP requirements before upload.",
      "Print covers must be prepared as a full wrap with front, spine, and back according to the final calculated print dimensions.",
      "Keep title, author name, and other required cover text legible at thumbnail size.",
      "Author approval is required before final publishing assets are promoted.",
    ];

    return {
      projectId: project.id,
      covers: [cover],
      kdpPreparationNotes: notes,
      approvalRequired: true,
    };
  }
}
