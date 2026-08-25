import { AuthorsForgeEngine, type AuthorForgeProject } from "../../core/workforce/authors-forge";

export type AuthorsForgeAction =
  | "create-project"
  | "add-character"
  | "add-timeline"
  | "add-chapter"
  | "lock-chapter";

export interface AuthorsForgeRequest {
  action: AuthorsForgeAction;
  project?: AuthorForgeProject;
  payload?: any;
}

export interface AuthorsForgeResponse {
  ok: boolean;
  message: string;
  project?: AuthorForgeProject;
  validation?: ReturnType<AuthorsForgeEngine["validateContinuity"]>;
}

export class AuthorsForgeApi {
  private readonly engine = new AuthorsForgeEngine();

  handle(request: AuthorsForgeRequest): AuthorsForgeResponse {
    try {
      if (request.action === "create-project") {
        const payload = request.payload ?? {};
        const project = this.engine.createProject(payload);
        return {
          ok: true,
          message: "Author's Forge project created.",
          project,
          validation: this.engine.validateContinuity(project),
        };
      }

      if (!request.project) {
        return { ok: false, message: "Author's Forge project is required." };
      }

      let project = request.project;
      switch (request.action) {
        case "add-character":
          project = this.engine.addCharacter(project, request.payload?.character);
          break;
        case "add-timeline":
          project = this.engine.addTimelineEvent(project, request.payload?.event);
          break;
        case "add-chapter":
          project = this.engine.addChapterCard(project, request.payload?.card);
          break;
        case "lock-chapter":
          project = this.engine.lockChapterCard(project, Number(request.payload?.chapterNumber));
          break;
        default:
          return { ok: false, message: `Unsupported Author's Forge action: ${request.action}` };
      }

      return {
        ok: true,
        message: `Author's Forge ${request.action.replace(/-/g, " ")} completed.`,
        project,
        validation: this.engine.validateContinuity(project),
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
