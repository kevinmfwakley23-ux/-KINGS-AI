import type {
  Artifact,
  ID,
} from "./types";

import {
  ArtifactRegistry,
} from "./artifact-registry";

import {
  ControlledFileEditor,
} from "./file-editor";

export interface ArtifactBuildRequest {
  artifactId: ID;
  name: string;
  description: string;
  type: Artifact["type"];
  path: string;
  content: string;
  agentId?: ID;
  taskId?: ID;
  missionId?: ID;
}

export interface ArtifactBuildResult {
  artifact: Artifact;
  bytesWritten: number;
}

export class ArtifactBuilder {
  constructor(
    private readonly editor:
      ControlledFileEditor,
    private readonly registry:
      ArtifactRegistry,
  ) {}

  async create(
    request:
      ArtifactBuildRequest,
  ): Promise<ArtifactBuildResult> {
    if (
      !request.artifactId.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Artifact Builder: artifact id is required",
      );
    }

    if (
      !request.name.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Artifact Builder: artifact name is required",
      );
    }

    if (
      !request.description.trim()
    ) {
      throw new Error(
        "K.I.N.G.S. Artifact Builder: artifact description is required",
      );
    }

    const write =
      await this.editor.write({
        path:
          request.path,
        content:
          request.content,
      });

    const artifact:
      Artifact = {
      id:
        request.artifactId,
      type:
        request.type,
      name:
        request.name,
      description:
        request.description,
      location:
        write.path,
      version:
        "1",
      contentHash:
        "sha256:" +
        Buffer.from(
          request.content,
          "utf8",
        ).toString(
          "hex",
        ),
      createdByAgentId:
        request.agentId,
      taskId:
        request.taskId,
      missionId:
        request.missionId,
      createdAt:
        new Date().toISOString(),
    };

    this.registry.register(
      artifact,
    );

    return {
      artifact,
      bytesWritten:
        write.bytesWritten,
    };
  }
}
