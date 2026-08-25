import type { AuthorForgeProject } from "./authors-forge";

export interface AuthorForgeImportResult {
  project: AuthorForgeProject;
  importedSections: string[];
  warnings: string[];
}

export interface AuthorForgePublishingPackage {
  projectId: string;
  title: string;
  genre: string;
  audience: string;
  description: string;
  productionChecklist: string[];
  metadataChecklist: string[];
  coverChecklist: string[];
  resourceChecklist: string[];
  readinessWarnings: string[];
}

export class AuthorsForgePublishingService {
  importPlainText(project: AuthorForgeProject, text: string): AuthorForgeImportResult {
    if (!text.trim()) {
      throw new Error("Author's Forge: imported manuscript is empty");
    }

    const sections: string[] = [];
    if (/^\s*chapter\s+\d+/im.test(text)) sections.push("chapter headings detected");
    if (/contents|table of contents/i.test(text)) sections.push("table of contents detected");
    if (/author|copyright|isbn/i.test(text)) sections.push("front/back matter indicators detected");

    const warnings: string[] = [];
    if (sections.length === 0) warnings.push("No recognizable manuscript structure was detected in the imported plain text.");

    return {
      project: {
        ...project,
        status: "editing",
        sourceDocumentReferences: [
          ...project.sourceDocumentReferences,
          `imported-text-${Date.now()}`,
        ],
        updatedAt: new Date().toISOString(),
      },
      importedSections: sections,
      warnings,
    };
  }

  createPublishingPackage(project: AuthorForgeProject): AuthorForgePublishingPackage {
    const manuscript = project.manuscript;
    const readinessWarnings: string[] = [];

    if (manuscript.chapterCards.length === 0) readinessWarnings.push("No chapter cards exist.");
    if (manuscript.chapterCards.some((card) => !card.locked)) readinessWarnings.push("Some chapter cards remain unlocked.");
    if (manuscript.completedChapterNumbers.length < manuscript.chapterCards.length) readinessWarnings.push("Not all planned chapters are marked complete.");
    if (!manuscript.title.trim()) readinessWarnings.push("Book title is missing.");
    if (!manuscript.genre.trim()) readinessWarnings.push("Genre is missing.");

    return {
      projectId: project.id,
      title: manuscript.title,
      genre: manuscript.genre,
      audience: manuscript.audience,
      description: manuscript.premise,
      productionChecklist: [
        "Final manuscript proofread",
        "Chapter order verified",
        "Front matter prepared",
        "Back matter prepared",
        "Print/ebook production files prepared",
      ],
      metadataChecklist: [
        "Book title and subtitle",
        "Author name",
        "Description / blurb",
        "Genre and categories",
        "Keywords",
        "Rights / edition information",
      ],
      coverChecklist: [
        "Front cover",
        "Spine",
        "Back cover",
        "Trim / bleed specification",
        "Ebook thumbnail",
      ],
      resourceChecklist: [
        "Publisher / platform research",
        "ISBN / identifier planning",
        "Distribution strategy",
        "Marketing metadata",
      ],
      readinessWarnings,
    };
  }
}
