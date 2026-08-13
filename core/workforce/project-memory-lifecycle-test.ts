import type {
  MemoryReference,
} from "./types";

import {
  ProjectMemoryLifecycleAuthority,
} from "./project-memory-lifecycle";

function assert(
  condition:
    boolean,
  message:
    string,
):
  void {
  if (
    !condition
  ) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

function memory(
  id:
    string,
  summary:
    string,
):
  MemoryReference {
  return {
    id,
    type:
      "semantic",
    summary,
    sourceReferences:
      [
        `evidence-${id}`,
      ],
    missionId:
      "mission-project-lifecycle",
    taskId:
      "task-project-lifecycle",
    authoritative:
      false,
    createdAt:
      "2026-08-13T00:00:00.000Z",
    updatedAt:
      "2026-08-13T01:00:00.000Z",
  };
}

const authority =
  new ProjectMemoryLifecycleAuthority();

const projectMemories =
  [
    memory(
      "memory-architecture",
      "Final architecture decision.",
    ),
    memory(
      "memory-lesson",
      "The first implementation failed because the interface was too tightly coupled.",
    ),
    memory(
      "memory-procedure",
      "Use an adapter boundary before provider-specific execution.",
    ),
    memory(
      "memory-failure",
      "Direct filesystem writes without authorization failed the project boundary.",
    ),
    memory(
      "memory-unimportant",
      "Temporary debugging observation.",
    ),
  ];

const request = {
  projectId:
    "project-memory-health-006",

  projectName:
    "Memory Lifecycle Proof Project",

  objective:
    "Prove safe project completion and memory release.",

  completedAt:
    "2026-08-13T06:00:00.000Z",

  memories:
    projectMemories,

  importantMemoryIds:
    [
      "memory-architecture",
      "memory-lesson",
    ],

  lessonMemoryIds:
    [
      "memory-lesson",
    ],

  reusableProcedureIds:
    [
      "memory-procedure",
    ],

  failedApproachMemoryIds:
    [
      "memory-failure",
    ],
};

const prepared =
  authority.prepareCompletion(
    request,
  );

assert(
  prepared.state ===
    "snapshot-ready",
  "Completed project must enter snapshot-ready state.",
);

assert(
  prepared.activeMemoryIds.length ===
    projectMemories.length,
  "All active project memories must be present before snapshot.",
);

console.log(
  "006.MEMORY project completion preparation: SUCCESS",
);

const snapshot =
  authority.createSnapshot(
    request,
  );

assert(
  snapshot.projectId ===
    request.projectId,
  "Snapshot must preserve project identity.",
);

assert(
  snapshot.memoryCount ===
    projectMemories.length,
  "Snapshot must record the full project-memory count.",
);

assert(
  snapshot.importantMemoryIds.includes(
    "memory-architecture",
  ),
  "Snapshot must preserve important project memories.",
);

assert(
  snapshot.lessonMemoryIds.includes(
    "memory-lesson",
  ),
  "Snapshot must preserve lessons learned.",
);

assert(
  snapshot.reusableProcedureIds.includes(
    "memory-procedure",
  ),
  "Snapshot must preserve reusable procedures.",
);

assert(
  snapshot.failedApproachMemoryIds.includes(
    "memory-failure",
  ),
  "Snapshot must preserve failed approaches for learning.",
);

assert(
  snapshot.preservedHistoryReferences.length ===
    projectMemories.length,
  "Snapshot must preserve provenance references for the project history.",
);

console.log(
  "006.MEMORY project learning snapshot creation: SUCCESS",
);

const verified =
  authority.verifySnapshot(
    request.projectId,
  );

assert(
  verified.snapshotId ===
    snapshot.snapshotId,
  "Verified snapshot must preserve snapshot identity.",
);

assert(
  verified.lessonMemoryIds.includes(
    "memory-lesson",
  ),
  "Verified snapshot must preserve lessons.",
);

console.log(
  "006.MEMORY project snapshot verification: SUCCESS",
);

const released =
  authority.releaseActiveMemory(
    request.projectId,
    "2026-08-13T06:01:00.000Z",
  );

assert(
  released.state ===
    "released",
  "Project must enter released state after verified snapshot.",
);

assert(
  released.activeMemoryIds.length ===
    0,
  "Released project must have no active project memory.",
);

assert(
  released.snapshotId ===
    snapshot.snapshotId,
  "Released project must retain its learning snapshot reference.",
);

console.log(
  "006.MEMORY active project memory release: SUCCESS",
);

const preservedAfterRelease =
  authority.verifySnapshot(
    request.projectId,
  );

assert(
  preservedAfterRelease.snapshotId ===
    snapshot.snapshotId,
  "Project learning snapshot must survive active-memory release.",
);

assert(
  preservedAfterRelease.preservedHistoryReferences.length >
    0,
  "Historical provenance must remain available after memory release.",
);

console.log(
  "006.MEMORY post-release learning preservation: SUCCESS",
);

let prematureReleaseRejected =
  false;

const secondAuthority =
  new ProjectMemoryLifecycleAuthority();

secondAuthority.prepareCompletion(
  request,
);

try {
  secondAuthority.releaseActiveMemory(
    request.projectId,
    "2026-08-13T06:02:00.000Z",
  );
} catch (error) {
  prematureReleaseRejected =
    error instanceof Error &&
    error.message.includes(
      "cannot release active memory before snapshot verification",
    );
}

assert(
  prematureReleaseRejected,
  "Active memory must not be released before a verified project snapshot exists.",
);

console.log(
  "006.MEMORY snapshot-before-release protection: SUCCESS",
);

let completedProjectReuseRejected =
  false;

try {
  authority.prepareCompletion(
    request,
  );
} catch (error) {
  completedProjectReuseRejected =
    error instanceof Error &&
    error.message.includes(
      "already passed completion",
    );
}

assert(
  completedProjectReuseRejected,
  "A completed project must not silently restart its memory lifecycle.",
);

console.log(
  "006.MEMORY completed-project lifecycle protection: SUCCESS",
);

console.log(
  "MEMORY-HEALTH-006 PROJECT COMPLETION → LEARNING SNAPSHOT → ACTIVE MEMORY RELEASE: SUCCESS",
);
