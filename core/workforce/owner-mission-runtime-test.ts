import {
  mkdtemp,
  readFile,
  rm,
} from "node:fs/promises";
import {
  tmpdir,
} from "node:os";
import {
  join,
} from "node:path";

import {
  OwnerMissionRuntime,
} from "./owner-mission-runtime";

function assert(
  condition: boolean,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

async function main(): Promise<void> {
  const root = await mkdtemp(
    join(tmpdir(), "kings-owner-mission-runtime-"),
  );
  const storePath = join(root, "state", "owner-missions.json");

  try {
    const runtime = new OwnerMissionRuntime(storePath);
    await runtime.initialize();

    const created = await runtime.createMission({
      productName: "Collector Workbench",
      ownerVision: [
        "Build a real collector workbench.",
        "It must catalog items, search inventory, and verify every production capability before release.",
      ].join(" "),
      contextDocuments: [
        {
          id: "context-product-requirements",
          name: "Product Requirements.pdf",
          mediaType: "application/pdf",
          sha256: "a".repeat(64),
          text: "The owner requires a mobile-first inventory screen and governed evidence for completed work.",
        },
      ],
    });

    assert(
      created.mission.status === "active",
      "Owner mission must be active after creation.",
    );
    assert(
      created.plan.approvedByHuman && created.plan.locked,
      "Build From This Vision must create an explicitly approved and locked plan.",
    );
    assert(
      created.tasks.length >= 8,
      "Owner vision must become the existing multi-stage product build graph.",
    );
    assert(
      created.execution.runnableTaskIds.length >= 1,
      "Created owner mission must expose runnable task state.",
    );
    assert(
      created.contextDocuments.length === 1 &&
      created.contextDocuments[0].characterCount > 0,
      "Owner context metadata must remain attached to the mission.",
    );
    assert(
      created.tasks.every((task) =>
        task.inputReferences.some((reference) =>
          reference.startsWith("owner-context:context-product-requirements:"),
        ),
      ),
      "Every generated task must retain the owner document context reference.",
    );

    const persisted = JSON.parse(
      await readFile(storePath, "utf8"),
    ) as {
      version?: number;
      records?: Array<{
        ownerVision?: string;
        contextDocuments?: Array<{ text?: string }>;
      }>;
    };
    assert(
      persisted.version === 1 &&
      persisted.records?.length === 1,
      "Owner mission must be persisted using the versioned runtime schema.",
    );
    assert(
      persisted.records[0].ownerVision?.includes("collector workbench") === true &&
      persisted.records[0].contextDocuments?.[0].text?.includes("mobile-first") === true,
      "Durable state must preserve the authoritative owner vision and extracted context text.",
    );

    console.log(
      "08.OWNER-MISSION durable creation: SUCCESS",
    );

    const restarted = new OwnerMissionRuntime(storePath);
    await restarted.initialize();
    const restored = restarted.snapshot(created.mission.id);

    assert(
      restored.mission.id === created.mission.id,
      "Restarted runtime must restore the same mission identity.",
    );
    assert(
      restored.plan.id === created.plan.id &&
      restored.plan.locked &&
      restored.plan.approvedByHuman,
      "Restarted runtime must restore the approved locked mission plan.",
    );
    assert(
      restored.tasks.length === created.tasks.length &&
      restored.execution.runnableTaskIds.length ===
        created.execution.runnableTaskIds.length,
      "Restarted runtime must restore executable task/dependency state.",
    );
    assert(
      restored.contextDocuments[0].sha256 === "a".repeat(64),
      "Restarted runtime must restore governed context provenance.",
    );

    console.log(
      "08.OWNER-MISSION process restart restore: SUCCESS",
    );
    console.log(
      "TREE-08 PERSISTENT OWNER MISSION RUNTIME: SUCCESS",
    );
  } finally {
    await rm(root, {
      recursive: true,
      force: true,
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
