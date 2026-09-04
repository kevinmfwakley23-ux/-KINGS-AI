import { strict as assert } from "node:assert";
import type { ModelRequestMessage } from "./model-interface";
import { buildBoundedRepairMessages } from "./model-driven-coding-execution";

function main(): void {
  const original: ModelRequestMessage[] = [
    {
      role: "system",
      content: "Stable K.I.N.G.S. coding policy and tool instructions.",
    },
    {
      role: "user",
      content: "Stable repository context plus acceptance criteria.",
    },
  ];

  const first = buildBoundedRepairMessages(
    original,
    `FIRST-PROPOSAL:${"A".repeat(30_000)}`,
    `FIRST-DIAGNOSTICS:${"D".repeat(40_000)}`,
    1,
  );

  assert.equal(
    first.length,
    original.length + 2,
    "one repair turn should add exactly one assistant proposal and one verification message",
  );
  assert.match(
    first[2].content,
    /previous generated FILE blocks truncated by K\.I\.N\.G\.S\./,
    "large generated output must be bounded",
  );
  assert.match(
    first[3].content,
    /diagnostics truncated by K\.I\.N\.G\.S\./,
    "large diagnostics must be bounded",
  );
  assert.ok(
    first[2].content.length < 12_100,
    "generated repair context must remain near its 12k character bound",
  );
  assert.ok(
    first[3].content.length < 21_500,
    "verification repair context must remain near its 20k diagnostic bound plus instructions",
  );

  const second = buildBoundedRepairMessages(
    original,
    `SECOND-PROPOSAL:${"B".repeat(30_000)}`,
    `SECOND-DIAGNOSTICS:${"E".repeat(40_000)}`,
    2,
  );

  assert.equal(
    second.length,
    first.length,
    "later retries must not accumulate earlier retry messages",
  );
  assert.equal(
    second.some((message) => message.content.includes("FIRST-PROPOSAL")),
    false,
    "the previous failed proposal from an older retry must not be resent",
  );
  assert.equal(
    second.some((message) => message.content.includes("FIRST-DIAGNOSTICS")),
    false,
    "obsolete verification diagnostics must not be resent",
  );
  assert.equal(
    second[0].content,
    original[0].content,
    "the stable system prefix must remain byte-for-byte reusable for prompt caching",
  );
  assert.equal(
    second[1].content,
    original[1].content,
    "the stable repository/task prefix must remain byte-for-byte reusable for prompt caching",
  );

  console.log("K.I.N.G.S. REPAIR CONTEXT → STABLE PREFIX: SUCCESS");
  console.log("K.I.N.G.S. REPAIR CONTEXT → LATEST FAILURE ONLY: SUCCESS");
  console.log("K.I.N.G.S. REPAIR CONTEXT → BOUNDED RETRY TOKENS: SUCCESS");
  console.log("TREE-KCM-MODEL-REPAIR-CONTEXT: SUCCESS");
}

try {
  main();
} catch (error) {
  console.error("TREE-KCM-MODEL-REPAIR-CONTEXT: FAILURE");
  console.error(error);
  process.exitCode = 1;
}
