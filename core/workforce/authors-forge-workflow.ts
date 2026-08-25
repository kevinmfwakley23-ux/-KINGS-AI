import type { AuthorForgeProject, AuthorForgeChapterCard } from "./authors-forge";

export interface AuthorForgeDraftRequest {
  chapterNumber: number;
  draft: string;
}

export interface AuthorForgeDraftResult {
  project: AuthorForgeProject;
  chapterNumber: number;
  draft: string;
  warnings: string[];
}

export interface AuthorForgeEditResult {
  chapterNumber: number;
  original: string;
  revised: string;
  changes: string[];
}

export class AuthorsForgeWorkflow {
  draftChapter(project: AuthorForgeProject, request: AuthorForgeDraftRequest): AuthorForgeDraftResult {
    const card = this.requireLockedCard(project, request.chapterNumber);
    if (!request.draft.trim()) {
      throw new Error("Author's Forge: chapter draft cannot be empty");
    }

    const warnings: string[] = [];
    const draftLower = request.draft.toLowerCase();
    for (const character of project.manuscript.characters.filter((item) => item.locked)) {
      if (!draftLower.includes(character.name.toLowerCase())) {
        warnings.push(`Locked character "${character.name}" is not referenced in this draft.`);
      }
    }

    const updated = {
      ...project,
      status: "writing" as const,
      manuscript: {
        ...project.manuscript,
        currentChapterNumber: request.chapterNumber,
        completedChapterNumbers: project.manuscript.completedChapterNumbers.includes(request.chapterNumber)
          ? project.manuscript.completedChapterNumbers
          : [...project.manuscript.completedChapterNumbers],
        chapterCards: project.manuscript.chapterCards.map((item) =>
          item.chapterNumber === request.chapterNumber
            ? { ...item, status: "drafted" as const }
            : item,
        ),
      },
      updatedAt: new Date().toISOString(),
    };

    return {
      project: updated,
      chapterNumber: card.chapterNumber,
      draft: request.draft,
      warnings,
    };
  }

  editChapter(
    project: AuthorForgeProject,
    chapterNumber: number,
    original: string,
    revised: string,
  ): AuthorForgeEditResult {
    this.requireLockedCard(project, chapterNumber);
    if (!original.trim() || !revised.trim()) {
      throw new Error("Author's Forge: original and revised chapter text are required");
    }

    const changes: string[] = [];
    if (original.length !== revised.length) changes.push("Length changed.");
    if (original !== revised) changes.push("Prose revised while preserving the locked chapter card as the structural authority.");

    return { chapterNumber, original, revised, changes };
  }

  private requireLockedCard(project: AuthorForgeProject, chapterNumber: number): AuthorForgeChapterCard {
    const card = project.manuscript.chapterCards.find((item) => item.chapterNumber === chapterNumber);
    if (!card) {
      throw new Error(`Author's Forge: chapter ${chapterNumber} has no chapter card; planning must precede drafting`);
    }
    if (!card.locked) {
      throw new Error(`Author's Forge: chapter ${chapterNumber} chapter card is not locked; drafting is blocked to prevent drift`);
    }
    return card;
  }
}
