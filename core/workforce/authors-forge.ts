import type { ID } from "./types";

export type AuthorForgeProjectStatus =
  | "idea"
  | "planning"
  | "writing"
  | "editing"
  | "art"
  | "publishing"
  | "complete";

export type AuthorForgeChapterStatus =
  | "planned"
  | "drafting"
  | "drafted"
  | "editing"
  | "locked";

export interface AuthorForgeCharacter {
  id: ID;
  name: string;
  role: string;
  description: string;
  goals: string[];
  conflicts: string[];
  traits: string[];
  relationships: string[];
  locked: boolean;
}

export interface AuthorForgeTimelineEvent {
  id: ID;
  dateLabel: string;
  title: string;
  description: string;
  sourceReferences: string[];
  locked: boolean;
}

export interface AuthorForgeChapterCard {
  id: ID;
  chapterNumber: number;
  title: string;
  pov: string;
  location: string;
  dateTime: string;
  emotionalGoal: string;
  plotGoal: string;
  majorEvents: string[];
  cluesAndReveals: string[];
  personalityInvolvement: string[];
  atmosphereNotes: string[];
  endingHook: string;
  estimatedWordCount: number;
  status: AuthorForgeChapterStatus;
  locked: boolean;
}

export interface AuthorForgeManuscript {
  id: ID;
  title: string;
  subtitle?: string;
  genre: string;
  audience: string;
  premise: string;
  themes: string[];
  styleGuide: string[];
  characters: AuthorForgeCharacter[];
  timeline: AuthorForgeTimelineEvent[];
  chapterCards: AuthorForgeChapterCard[];
  completedChapterNumbers: number[];
  currentChapterNumber?: number;
  unresolvedThreads: string[];
  continuityRules: string[];
  publishingNotes: string[];
}

export interface AuthorForgeProject {
  id: ID;
  name: string;
  status: AuthorForgeProjectStatus;
  manuscript: AuthorForgeManuscript;
  sourceDocumentReferences: string[];
  artifactReferences: string[];
  authoritativeDecisionReferences: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AuthorForgeValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class AuthorsForgeEngine {
  createProject(input: {
    id: ID;
    name: string;
    title: string;
    genre: string;
    audience: string;
    premise: string;
    themes?: string[];
    styleGuide?: string[];
  }): AuthorForgeProject {
    const now = new Date().toISOString();
    const manuscript: AuthorForgeManuscript = {
      id: `manuscript-${input.id}`,
      title: input.title,
      genre: input.genre,
      audience: input.audience,
      premise: input.premise,
      themes: [...(input.themes ?? [])],
      styleGuide: [...(input.styleGuide ?? [])],
      characters: [],
      timeline: [],
      chapterCards: [],
      completedChapterNumbers: [],
      unresolvedThreads: [],
      continuityRules: [
        "Locked canon must not be changed silently.",
        "Chapter drafting requires an approved chapter card.",
        "Completed chapters remain part of continuity memory.",
        "New plot facts must be traceable to an authoritative source, decision, or approved draft.",
      ],
      publishingNotes: [],
    };

    return {
      id: input.id,
      name: input.name,
      status: "idea",
      manuscript,
      sourceDocumentReferences: [],
      artifactReferences: [],
      authoritativeDecisionReferences: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  addCharacter(
    project: AuthorForgeProject,
    character: AuthorForgeCharacter,
  ): AuthorForgeProject {
    if (project.manuscript.characters.some((item) => item.id === character.id)) {
      throw new Error(`Author's Forge: duplicate character "${character.id}"`);
    }
    return this.updated(project, {
      manuscript: {
        ...project.manuscript,
        characters: [...project.manuscript.characters, { ...character }],
      },
      status: "planning",
    });
  }

  addTimelineEvent(
    project: AuthorForgeProject,
    event: AuthorForgeTimelineEvent,
  ): AuthorForgeProject {
    if (project.manuscript.timeline.some((item) => item.id === event.id)) {
      throw new Error(`Author's Forge: duplicate timeline event "${event.id}"`);
    }
    return this.updated(project, {
      manuscript: {
        ...project.manuscript,
        timeline: [...project.manuscript.timeline, { ...event }],
      },
      status: "planning",
    });
  }

  addChapterCard(
    project: AuthorForgeProject,
    card: AuthorForgeChapterCard,
  ): AuthorForgeProject {
    if (card.chapterNumber < 1) {
      throw new Error("Author's Forge: chapter number must be positive");
    }
    if (project.manuscript.chapterCards.some((item) => item.chapterNumber === card.chapterNumber)) {
      throw new Error(`Author's Forge: chapter ${card.chapterNumber} already exists`);
    }
    return this.updated(project, {
      manuscript: {
        ...project.manuscript,
        chapterCards: [...project.manuscript.chapterCards, { ...card }].sort(
          (a, b) => a.chapterNumber - b.chapterNumber,
        ),
      },
      status: "planning",
    });
  }

  lockChapterCard(
    project: AuthorForgeProject,
    chapterNumber: number,
  ): AuthorForgeProject {
    const card = project.manuscript.chapterCards.find(
      (item) => item.chapterNumber === chapterNumber,
    );
    if (!card) {
      throw new Error(`Author's Forge: chapter ${chapterNumber} does not have a chapter card`);
    }
    if (!card.title.trim() || !card.plotGoal.trim() || !card.emotionalGoal.trim()) {
      throw new Error(`Author's Forge: chapter ${chapterNumber} card is incomplete`);
    }
    return this.updated(project, {
      manuscript: {
        ...project.manuscript,
        chapterCards: project.manuscript.chapterCards.map((item) =>
          item.chapterNumber === chapterNumber
            ? { ...item, locked: true, status: "locked" }
            : item,
        ),
      },
    });
  }

  validateContinuity(project: AuthorForgeProject): AuthorForgeValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const cards = project.manuscript.chapterCards;

    const chapterNumbers = new Set<number>();
    for (const card of cards) {
      if (chapterNumbers.has(card.chapterNumber)) {
        errors.push(`Duplicate chapter number ${card.chapterNumber}.`);
      }
      chapterNumbers.add(card.chapterNumber);
      if (card.locked && card.status !== "locked") {
        errors.push(`Chapter ${card.chapterNumber} is locked but status is not locked.`);
      }
    }

    for (let chapter = 1; chapter <= cards.length; chapter += 1) {
      if (!chapterNumbers.has(chapter)) {
        warnings.push(`Chapter ${chapter} is not yet planned.`);
      }
    }

    const lockedCharacters = project.manuscript.characters.filter((character) => character.locked);
    if (lockedCharacters.length === 0) {
      warnings.push("No characters are locked into canon yet.");
    }

    if (project.manuscript.timeline.length === 0) {
      warnings.push("The manuscript does not have a timeline yet.");
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  private updated(
    project: AuthorForgeProject,
    patch: Partial<AuthorForgeProject>,
  ): AuthorForgeProject {
    return {
      ...project,
      ...patch,
      manuscript: patch.manuscript ?? project.manuscript,
      updatedAt: new Date().toISOString(),
    };
  }
}
