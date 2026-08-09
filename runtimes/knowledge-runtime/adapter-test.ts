import {
  createDefaultKnowledgeRuntimeAdapter,
} from "./adapter";

async function main(): Promise<void> {
  const adapter =
    createDefaultKnowledgeRuntimeAdapter();

  const result =
    await adapter.retrieve({
      query: "Keeper Framework",
      sourceIds: [
        "kings-ai-build-directive",
      ],
      memoryTypes: [
        "procedural",
      ],
      authoritativeOnly: true,
      limit: 3,
    });

  if (
    result.records.length !== 1
  ) {
    throw new Error(
      "Expected exactly one Keeper Framework record.",
    );
  }

  if (
    result.evidence.length !== 1
  ) {
    throw new Error(
      "Expected exactly one evidence item.",
    );
  }

  const record =
    result.records[0];

  const evidence =
    result.evidence[0];

  if (
    record.sourceId !==
    "kings-ai-build-directive"
  ) {
    throw new Error(
      "Knowledge record has incorrect source ID.",
    );
  }

  if (
    record.memoryType !==
    "procedural"
  ) {
    throw new Error(
      "Build directive was not mapped to procedural memory.",
    );
  }

  if (!record.authoritative) {
    throw new Error(
      "Build directive record was not authoritative.",
    );
  }

  if (
    evidence.sourceId !==
    record.sourceId
  ) {
    throw new Error(
      "Evidence source does not match record source.",
    );
  }

  if (
    !evidence.location?.includes(
      "#page=2",
    )
  ) {
    throw new Error(
      "Evidence did not preserve page 2 provenance.",
    );
  }

  if (
    !evidence.excerpt?.includes(
      "Keeper",
    )
  ) {
    throw new Error(
      "Evidence excerpt does not contain Keeper evidence.",
    );
  }

  if (
    result.sourceIds.length !== 1 ||
    result.sourceIds[0] !==
      "kings-ai-build-directive"
  ) {
    throw new Error(
      "Memory result has incorrect source IDs.",
    );
  }

  console.log(
    "Knowledge runtime adapter: SUCCESS",
  );
}

main().catch(
  (error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  },
);
