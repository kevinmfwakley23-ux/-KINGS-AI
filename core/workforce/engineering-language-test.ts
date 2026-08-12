import {
  EngineeringLanguageRegistry,
} from "./engineering-language";

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
    new EngineeringLanguageRegistry();

  for (
    const language of
    [
      {
        id:
          "typescript",
        displayName:
          "TypeScript",
        fileExtensions: [
          ".ts",
        ],
        aliases: [
          "ts",
        ],
        enabled:
          true,
      },
      {
        id:
          "python",
        displayName:
          "Python",
        fileExtensions: [
          ".py",
        ],
        aliases: [],
        enabled:
          true,
      },
    ]
  ) {
    registry.register(
      language,
    );
  }

  assert(
    registry.resolve(
      "ts",
    )?.id ===
      "typescript",
    "Language alias resolution failed.",
  );

  console.log(
    "08.LANGUAGE alias resolution: SUCCESS",
  );

  assert(
    registry.detectByExtension(
      ".py",
    )?.id ===
      "python",
    "Language extension detection failed.",
  );

  console.log(
    "08.LANGUAGE extension detection: SUCCESS",
  );

  registry.register({
    id:
      "kotlin",
    displayName:
      "Kotlin",
    fileExtensions: [
      ".kt",
      ".kts",
    ],
    aliases: [
      "kt",
    ],
    enabled:
      true,
  });

  assert(
    registry.resolve(
      "kotlin",
    )?.displayName ===
      "Kotlin",
    "New language registration failed without core redesign.",
  );

  console.log(
    "08.LANGUAGE dynamic registration: SUCCESS",
  );

  assert(
    registry.list().length ===
      3,
    "Language registry did not preserve all registered languages.",
  );

  console.log(
    "08.LANGUAGE deterministic registry: SUCCESS",
  );

  let duplicateRejected =
    false;

  try {
    registry.register({
      id:
        "kotlin",
      displayName:
        "Kotlin",
      fileExtensions: [
        ".kt",
      ],
      aliases: [],
      enabled:
        true,
    });
  } catch {
    duplicateRejected =
      true;
  }

  assert(
    duplicateRejected,
    "Duplicate language registration was not rejected.",
  );

  console.log(
    "08.LANGUAGE duplicate protection: SUCCESS",
  );

  console.log(
    "TREE-08 EXTENSIBLE LANGUAGE IDENTITY: SUCCESS",
  );
}

main();
