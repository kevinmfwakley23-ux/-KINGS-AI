import assert from "node:assert/strict";

import { KnowledgeRegistry } from "./knowledge-registry";
import { MemorySourceFreshnessAuthority } from "./memory-source-freshness";
import { MemoryStore } from "./memory-store";
import type { KnowledgeSource, MemoryReference } from "./types";

function source(version: string, contentHash: string, updatedAt: string): KnowledgeSource {
  return {
    id: "source-repository-main",
    type: "repository",
    name: "K.I.N.G.S. repository",
    description: "Current repository state used to derive coding memory.",
    location: "repo://kings-ai/main",
    authoritative: true,
    version,
    contentHash,
    createdAt: "2026-09-05T00:00:00.000Z",
    updatedAt,
  };
}

function memory(id: string, authoritative: boolean, refs = ["source-repository-main", "evidence-build-green"]): MemoryReference {
  return {
    id,
    type: "semantic",
    summary: "The shared router currently supports a governed provider boundary.",
    sourceReferences: refs,
    missionId: "mission-memory-revalidation",
    authoritative,
    createdAt: "2026-09-05T01:00:00.000Z",
    updatedAt: "2026-09-05T01:00:00.000Z",
  };
}

function main(): void {
  const registry = new KnowledgeRegistry();
  registry.registerSource(source("commit-a", "sha256-a", "2026-09-05T00:30:00.000Z"));

  const freshness = new MemorySourceFreshnessAuthority(registry);
  const store = new MemoryStore(freshness);

  store.register(memory("memory-current", true));
  assert.equal(store.query({ authoritativeOnly: true }).length, 1, "current authoritative memory must remain retrievable");
  const current = store.evaluateFreshness("memory-current");
  assert.equal(current?.status, "current");
  assert.deepEqual(current?.untrackedReferenceIds, ["evidence-build-green"], "non-KnowledgeSource provenance must remain visible as untracked evidence");
  assert.equal(current?.findings[0]?.expectedVersion, "commit-a");
  assert.equal(current?.findings[0]?.expectedContentHash, "sha256-a");

  registry.updateSource(source("commit-b", "sha256-b", "2026-09-05T02:00:00.000Z"));
  const stale = store.evaluateFreshness("memory-current");
  assert.equal(stale?.status, "stale", "changing the tracked repository fingerprint must stale the remembered claim");
  assert.equal(store.query({ authoritativeOnly: true }).length, 0, "stale authoritative memory must fail closed during normal retrieval");
  assert.ok(store.get("memory-current"), "stale memory must remain inspectable for audit instead of being deleted");

  const promotableStore = new MemoryStore(new MemorySourceFreshnessAuthority(registry));
  promotableStore.register(memory("memory-promotion", false));
  registry.updateSource(source("commit-c", "sha256-c", "2026-09-05T03:00:00.000Z"));
  assert.throws(
    () => promotableStore.promote("memory-promotion"),
    /cannot become authoritative because its source provenance is stale/,
    "memory derived from an old source revision must not be promoted after the source changes",
  );

  promotableStore.register(memory("memory-new", false));
  const promoted = promotableStore.promote("memory-new");
  assert.equal(promoted.authoritative, true);
  assert.equal(promotableStore.evaluateFreshness("memory-new")?.status, "current");

  const legacyStore = new MemoryStore(new MemorySourceFreshnessAuthority(registry));
  legacyStore.register(memory("memory-untracked", true, ["external-human-approval"]));
  assert.equal(legacyStore.evaluateFreshness("memory-untracked")?.status, "unverified");
  assert.equal(legacyStore.query({ authoritativeOnly: true }).length, 1, "existing non-registry provenance remains backward-compatible and explicitly unverified");

  registry.clear();
  assert.equal(promotableStore.evaluateFreshness("memory-new")?.status, "missing");
  assert.equal(promotableStore.query({ authoritativeOnly: true }).length, 0, "missing tracked sources must fail closed for authoritative retrieval");

  console.log("K.I.N.G.S. memory source revalidation: SUCCESS");
}

main();
