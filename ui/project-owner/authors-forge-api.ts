import {
  AuthorsForgeEngine,
  type AuthorForgeProject,
} from "../../core/workforce/authors-forge";
import { AuthorsForgeWorkflow } from "../../core/workforce/authors-forge-workflow";
import { AuthorsForgePublishingService } from "../../core/workforce/authors-forge-publishing";

export type AuthorsForgeAction =
  | "create-project"
  | "add-character"
  | "add-timeline"
  | "add-chapter"
  | "lock-chapter"
  | "draft-chapter"
  | "edit-chapter"
  | "import-text"
  | "publishing-package";

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
  result?: unknown;
}

export class AuthorsForgeApi {
  private readonly engine = new AuthorsForgeEngine();
  private readonly workflow = new AuthorsForgeWorkflow();
  private readonly publishing = new AuthorsForgePublishingService();

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
      let result: unknown;
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
        case "draft-chapter": {
          const drafted = this.workflow.draftChapter(project, request.payload);
          project = drafted.project;
          result = drafted;
          break;
        }
        case "edit-chapter":
          result = this.workflow.editChapter(
            project,
            Number(request.payload?.chapterNumber),
            String(request.payload?.original ?? ""),
            String(request.payload?.revised ?? ""),
          );
          break;
        case "import-text":
          result = this.publishing.importPlainText(project, String(request.payload?.text ?? ""));
          project = (result as { project: AuthorForgeProject }).project;
          break;
        case "publishing-package":
          result = this.publishing.createPublishingPackage(project);
          break;
        default:
          return { ok: false, message: `Unsupported Author's Forge action: ${request.action}` };
      }

      return {
        ok: true,
        message: `Author's Forge ${request.action.replace(/-/g, " ")} completed.`,
        project,
        validation: this.engine.validateContinuity(project),
        result,
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
