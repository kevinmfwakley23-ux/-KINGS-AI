import {
  LocalCodingVerificationLoop,
} from "./local-coding-verification-loop";

import {
  executeCodingToolLoop,
} from "./local-coding-tool-loop";

function printUsage(): void {
  console.log(
    [
      "K.I.N.G.S. Coding Machine V1",
      "",
      "Usage:",
      '  node kings-code.js "your coding request"',
      "",
      "Example:",
      '  node kings-code.js "Create a TypeScript utility that validates email addresses."',
    ].join("\n"),
  );
}

async function main(): Promise<void> {
  const instruction =
    process.argv
      .slice(2)
      .join(" ")
      .trim();

  if (!instruction) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const workspacePath =
    process.env.KINGS_WORKSPACE ??
    process.cwd();

  const targetPath =
    process.env.KINGS_TARGET ??
    `${workspacePath}/generated/kings-output.ts`;

  console.log(
    "K.I.N.G.S. CODING MACHINE V1",
  );

  console.log(
    `WORKSPACE: ${workspacePath}`,
  );

  console.log(
    `TARGET: ${targetPath}`,
  );

  console.log(
    `REQUEST: ${instruction}`,
  );

  console.log(
    "PRE-FLIGHT: repository search + source inspection + baseline test",
  );

  const toolContext =
    await executeCodingToolLoop({
      workspacePath,

      query:
        instruction,

      candidatePaths: [
        targetPath,
      ],

      testCommand:
        process.execPath,

      testArgs: [
        "-e",
        "console.log('KINGS_BASELINE_TOOL_CHECK')",
      ],

      maxMatches:
        12,

      maxFiles:
        5,

      maxFileBytes:
        128 * 1024,

      timeoutMs:
        5000,

      maxOutputBytes:
        16 * 1024,
    });

  console.log(
    `PRE-FLIGHT SEARCH MATCHES: ${toolContext.searchResults.length}`,
  );

  console.log(
    `PRE-FLIGHT SOURCE FILES: ${toolContext.inspectedFiles.length}`,
  );

  console.log(
    `PRE-FLIGHT TEST: ${
      toolContext.testResult.success
        ? "PASS"
        : "FAIL"
    }`,
  );

  if (
    !toolContext.testResult.success
  ) {
    console.log(
      "PRE-FLIGHT WARNING: baseline test failed; continuing to coding worker for diagnosis.",
    );
  }

  const enrichedInstruction =
    [
      instruction,
      "",
      "K.I.N.G.S. pre-flight repository evidence follows.",
      toolContext.context,
      "",
      "Use this evidence to make the requested change.",
    ].join("\n");

  const loop =
    new LocalCodingVerificationLoop();

  const result =
    await loop.execute({
      taskId:
        `cli-task-${Date.now()}`,

      missionId:
        `cli-mission-${Date.now()}`,

      instruction:
        enrichedInstruction,

      workspacePath,

      targetPath,

      allowedReadPaths: [
        workspacePath,
      ],

      allowedWritePaths: [
        targetPath,
      ],

      maxFileBytes:
        128 * 1024,

      maxOutputTokens:
        1024,

      maxRepairAttempts:
        3,
    });

  console.log("");

  if (!result.success) {
    console.error(
      "K.I.N.G.S. CODING MACHINE: FAILED",
    );

    console.error(
      result.reasons.join(
        "\n",
      ),
    );

    process.exitCode = 1;
    return;
  }

  console.log(
    "K.I.N.G.S. CODING MACHINE: SUCCESS",
  );

  console.log(
    `ATTEMPTS: ${result.attempts}`,
  );

  console.log(
    `TARGET VERIFIED: ${targetPath}`,
  );

  console.log(
    "COMPILER: PASS",
  );
}

main().catch(
  (
    error,
  ) => {
    console.error(
      error,
    );

    process.exitCode =
      1;
  },
);
