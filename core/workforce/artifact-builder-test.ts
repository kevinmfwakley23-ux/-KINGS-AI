import {
  mkdtemp,
  rm,
  readFile,
} from "node:fs/promises";

import {
  tmpdir,
} from "node:os";

import {
  join,
} from "node:path";

import {
  ArtifactRegistry,
} from "./artifact-registry";

import {
  ControlledFileEditor,
} from "./file-editor";

import {
  ArtifactBuilder,
} from "./artifact-builder";

function assert(
  condition: boolean,
  message: string,
): void {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

async function main(): Promise<void> {
  const root =
    await mkdtemp(
      join(
        tmpdir(),
        "kings-tree-06-builder-",
      ),
    );

  const workspace =
    join(
      root,
      "workspace",
    );

  const path =
    join(
      workspace,
      "src",
      "artifact.ts",
    );

  const registry =
    new ArtifactRegistry();

  const editor =
    new ControlledFileEditor({
      allowedReadPaths: [
        workspace,
      ],
      allowedWritePaths: [
        workspace,
      ],
      maxFileBytes:
        4096,
    });

  const builder =
    new ArtifactBuilder(
      editor,
      registry,
    );

  const content =
    "export const TREE_06 = true;\n";

  try {
    const result =
      await builder.create({
        artifactId:
          "artifact-tree-06-builder",
        name:
          "Tree 06 Builder Artifact",
        description:
          "Artifact produced through the governed file editor.",
        type:
          "code",
        path,
        content,
        agentId:
          "agent-tree-06",
        taskId:
          "task-tree-06",
        missionId:
          "mission-tree-06",
      });

    assert(
      result.bytesWritten ===
        Buffer.byteLength(
          content,
          "utf8",
        ),
      "Artifact builder must report the exact number of bytes written.",
    );

    const written =
      await readFile(
        path,
        "utf8",
      );

    assert(
      written ===
        content,
      "Artifact builder must create the requested file content.",
    );

    const artifact =
      registry.get(
        "artifact-tree-06-builder",
      );

    assert(
      artifact !==
        undefined,
      "Artifact builder must register the resulting artifact.",
    );

    assert(
      artifact?.location ===
        path,
      "Artifact location must point to the governed output path.",
    );

    assert(
      artifact?.taskId ===
        "task-tree-06",
      "Artifact task provenance must be preserved.",
    );

    assert(
      artifact?.missionId ===
        "mission-tree-06",
      "Artifact mission provenance must be preserved.",
    );

    console.log(
      "TREE-06 artifact creation through controlled editor: SUCCESS",
    );

    console.log(
      "TREE-06 artifact registration with provenance: SUCCESS",
    );

    console.log(
      "TREE-06 BUILDER ARTIFACT CREATION: SUCCESS",
    );
  } finally {
    await rm(
      root,
      {
        recursive:
          true,
        force:
          true,
      },
    );
  }
}

main().catch(
  (error) => {
    console.error(
      error,
    );
    process.exitCode =
      1;
  },
);
