import {
  EngineeringToolchainRegistry,
  createDefaultEngineeringToolchains,
} from "./engineering-toolchain";

function assert(
  condition:
    boolean,
  message:
    string,
): void {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

function main(): void {
  const registry =
    new EngineeringToolchainRegistry();

  for (
    const toolchain of
      createDefaultEngineeringToolchains()
  ) {
    registry.register(
      toolchain,
    );
  }

  assert(
    registry.list().length ===
      12,
    "K.I.N.G.S. must register the initial supported engineering language families.",
  );

  const requiredLanguages = [
    "typescript",
    "javascript",
    "python",
    "rust",
    "go",
    "java",
    "c",
    "cpp",
    "shell",
    "html",
    "css",
    "sql",
  ] as const;

  for (
    const language of
      requiredLanguages
  ) {
    const requiredOperations =
      language === "c" ||
      language === "cpp"
        ? [
            "compile",
            "build",
            "run",
            "test",
          ] as const
        : [
            "create",
            "test",
          ] as const;

    const result =
      registry.discover({
        language,
        requiredOperations:
          [...requiredOperations],
      });

    assert(
      result.supported,
      `Language "${language}" must support its required governed engineering workflow.`,
    );
  }

  const rust =
    registry.discover({
      language:
        "rust",
      requiredOperations: [
        "compile",
        "build",
        "run",
        "test",
      ],
    });

  assert(
    rust.supported,
    "Rust must support compile/build/run/test workflow.",
  );

  const go =
    registry.discover({
      language:
        "go",
      requiredOperations: [
        "compile",
        "build",
        "run",
        "test",
      ],
    });

  assert(
    go.supported,
    "Go must support compile/build/run/test workflow.",
  );

  const cpp =
    registry.discover({
      language:
        "cpp",
      requiredOperations: [
        "compile",
        "build",
        "run",
        "test",
      ],
    });

  assert(
    cpp.supported,
    "C++ must support compile/build/run/test workflow.",
  );

  console.log(
    "08.6 engineering language registry: SUCCESS",
  );

  console.log(
    "08.6 multi-language toolchain discovery: SUCCESS",
  );

  console.log(
    "08.6 governed creation/testing capability: SUCCESS",
  );

  console.log(
    "08.6 compiled-language workflow coverage: SUCCESS",
  );

  console.log(
    "TREE-08.6 ENGINEERING TOOLCHAIN AUTHORITY: SUCCESS",
  );
}

main();
