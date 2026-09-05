import {
  mkdtemp,
  mkdir,
  writeFile,
  symlink,
  access,
  rm,
} from "node:fs/promises";

import {
  tmpdir,
} from "node:os";

import {
  join,
} from "node:path";

import {
  ControlledFileEditor,
} from "./file-editor";

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
        "kings-tree-06-",
      ),
    );

  const allowed =
    join(
      root,
      "workspace",
    );

  const outside =
    join(
      root,
      "outside",
    );

  const file =
    join(
      allowed,
      "src",
      "generated.ts",
    );

  const editor =
    new ControlledFileEditor({
      allowedReadPaths: [
        allowed,
      ],
      allowedWritePaths: [
        allowed,
      ],
      maxFileBytes:
        4096,
    });

  try {
    const write =
      await editor.write({
        path:
          file,
        content:
          "export const BUILD_OK = true;\n",
      });

    assert(
      write.bytesWritten > 0,
      "Controlled write must report bytes written.",
    );

    const exists =
      await editor.exists({
        path:
          file,
      });

    assert(
      exists,
      "Controlled write must create the artifact.",
    );

    const read =
      await editor.read({
        path:
          file,
      });

    assert(
      read.content.includes(
        "BUILD_OK",
      ),
      "Controlled read must return written content.",
    );

    let traversalRejected =
      false;

    try {
      await editor.read({
        path:
          join(
            allowed,
            "..",
            "outside",
            "secret.txt",
          ),
      });
    } catch {
      traversalRejected =
        true;
    }

    assert(
      traversalRejected,
      "Path traversal outside the authorized root must be rejected.",
    );

    let outsideWriteRejected =
      false;

    try {
      await editor.write({
        path:
          join(
            outside,
            "blocked.ts",
          ),
        content:
          "blocked",
      });
    } catch {
      outsideWriteRejected =
        true;
    }

    assert(
      outsideWriteRejected,
      "Writes outside the authorized root must be rejected.",
    );

    await mkdir(outside, { recursive: true });
    const outsideSecret = join(outside, "host-secret.txt");
    await writeFile(outsideSecret, "HOST_SECRET=never-leak\n", "utf8");
    const linkedSecret = join(allowed, "linked-secret.txt");
    const linkedDirectory = join(allowed, "linked-outside");
    await symlink(outsideSecret, linkedSecret);
    await symlink(outside, linkedDirectory, "dir");

    let symlinkReadRejected = false;
    try {
      await editor.read({ path: linkedSecret });
    } catch {
      symlinkReadRejected = true;
    }
    assert(
      symlinkReadRejected,
      "Reads through an authorized-root symlink must be rejected.",
    );

    const escapedWritePath = join(linkedDirectory, "escaped.ts");
    let symlinkWriteRejected = false;
    try {
      await editor.write({
        path: escapedWritePath,
        content: "export const ESCAPED = true;\n",
      });
    } catch {
      symlinkWriteRejected = true;
    }
    assert(
      symlinkWriteRejected,
      "Writes through an authorized-root symlink directory must be rejected.",
    );

    let escapedFileExists = true;
    try {
      await access(join(outside, "escaped.ts"));
    } catch {
      escapedFileExists = false;
    }
    assert(
      !escapedFileExists,
      "Rejected symlink write must not create a host-side file.",
    );

    let oversizedRejected =
      false;

    try {
      await editor.write({
        path:
          join(
            allowed,
            "oversized.txt",
          ),
        content:
          "x".repeat(
            4097,
          ),
      });
    } catch {
      oversizedRejected =
        true;
    }

    assert(
      oversizedRejected,
      "Files exceeding the configured size limit must be rejected.",
    );

    console.log(
      "TREE-06 controlled file write: SUCCESS",
    );

    console.log(
      "TREE-06 controlled file read: SUCCESS",
    );

    console.log(
      "TREE-06 path authorization: SUCCESS",
    );

    console.log(
      "TREE-06 traversal protection: SUCCESS",
    );

    console.log(
      "TREE-06 symlink escape protection: SUCCESS",
    );

    console.log(
      "TREE-06 file-size enforcement: SUCCESS",
    );

    console.log(
      "TREE-06 CONTROLLED FILE EDITING: SUCCESS",
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
