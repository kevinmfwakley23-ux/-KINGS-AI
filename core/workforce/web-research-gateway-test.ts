import {
  KnowledgeRegistry,
} from "./knowledge-registry";

import {
  WebResearchGateway,
  type WebResearchFetcher,
} from "./web-research-gateway";

function assert(
  condition:
    unknown,
  message:
    string,
): asserts condition {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

class FakeWebFetcher
  implements WebResearchFetcher {
  async fetch(
    url:
      string,
  ):
    Promise<{
      body:
        string;
      finalUrl:
        string;
    }> {
    return {
      body:
        `K.I.N.G.S. research source for ${url}. TypeScript build commands can be verified through the registered toolchain.`,
      finalUrl:
        url,
    };
  }
}

async function main(): Promise<void> {
  const registry =
    new KnowledgeRegistry();

  const gateway =
    new WebResearchGateway(
      registry,
      new FakeWebFetcher(),
    );

  const result =
    await gateway.research({
      id:
        "research-typescript-build",
      url:
        "https://example.invalid/typescript-build",
      title:
        "TypeScript Build Research",
      description:
        "Test web research source.",
      authoritative:
        false,
      sourceType:
        "repository",
      knowledgeSummary:
        "TypeScript build commands must be verified against the active project toolchain.",
      knowledgeContent:
        "Use the project's registered toolchain commands and verify the resulting build rather than assuming a command is available.",
    });

  assert(
    result.source.id ===
      "research-typescript-build",
    "source must be registered",
  );

  assert(
    result.evidence.sourceId ===
      result.source.id,
    "evidence must preserve source provenance",
  );

  assert(
    result.record.evidenceIds.includes(
      result.evidence.id,
    ),
    "knowledge record must reference its evidence",
  );

  assert(
    result.record.authoritative ===
      false,
    "web research must not silently become authoritative knowledge",
  );

  assert(
    registry.getSource(
      result.source.id,
    ) !== undefined,
    "registry must contain the source",
  );

  assert(
    registry.getEvidence(
      result.evidence.id,
    ) !== undefined,
    "registry must contain the evidence",
  );

  assert(
    registry.getRecord(
      result.record.id,
    ) !== undefined,
    "registry must contain the knowledge record",
  );

  console.log(
    "K.I.N.G.S. WEB RESEARCH → SOURCE CAPTURE: SUCCESS",
  );

  console.log(
    "K.I.N.G.S. WEB RESEARCH → EVIDENCE PROVENANCE: SUCCESS",
  );

  console.log(
    "K.I.N.G.S. WEB RESEARCH → NON-AUTHORITATIVE LEARNING: SUCCESS",
  );

  console.log(
    "TREE-KCM-WEB-RESEARCH: SUCCESS",
  );
}

main().catch(
  (error) => {
    console.error(
      "TREE-KCM-WEB-RESEARCH: FAILURE",
    );
    console.error(
      error,
    );
    process.exitCode =
      1;
  },
);
