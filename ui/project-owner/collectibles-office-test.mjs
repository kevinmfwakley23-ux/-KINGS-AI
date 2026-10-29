import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CollectiblesAssessmentOffice } from "./collectibles-office.mjs";

const tinyPng = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]).toString("base64");
const picture = { filename: "front.png", mimeType: "image/png", base64: tinyPng };
const response = {
  identification: { name: "Example card", details: "Visible fictional test item", confidence: "medium" },
  condition: { summary: "Minor edge wear visible on front.", observations: [
    { area: "left edge", observation: "Minor whitening", photoIndex: 0, severity: "minor" }
  ], gradeEstimate: { basis: "photo_estimate", low: 7, high: 9, confidence: "low" } },
  authenticityFlags: ["Authenticity cannot be confirmed from the photograph"],
  limitations: ["Back not pictured"], recommendedNextSteps: ["Photograph reverse and corners"]
};
const payload = { category: "tcg", itemName: "Test Pokémon card", notes: "No submission yet", photos: [picture] };

async function withOffice(run, mockedResponse = response) {
  const dir = await mkdtemp(join(tmpdir(), "kings-collectibles-"));
  const seen = [];
  const router = { route: async input => {
    seen.push(input);
    return { success: true, content: JSON.stringify(mockedResponse),
      providerId: "omniroute", modelId: "vision-model", requestId: "test-1" };
  }};
  const storePath = join(dir, "state", "reports.json");
  try {
    const office = new CollectiblesAssessmentOffice({ router, storePath });
    await office.initialize();
    await run({ office, seen, storePath, router });
  } finally { await rm(dir, { recursive: true, force: true }); }
}

test("routes actual image bytes to a vision-capable provider and persists verifiable evidence", async () => {
  await withOffice(async ({ office, seen, storePath, router }) => {
    const report = await office.assess(payload);
    assert.equal(report.condition.gradeEstimate.low, 7);
    assert.equal(report.condition.gradeEstimate.high, 9);
    assert.equal(report.authenticity.status, "unverified");
    assert.equal(report.marketValue.status, "not_assessed");
    assert.equal(report.evidence.modelProvider, "omniroute");
    assert.equal(report.photos[0].sha256.length, 64);
    assert.equal(report.condition.observations[0].photoIndex, 0);
    assert.deepEqual(seen[0].requiredCapabilities, ["reasoning", "vision", "structured-output"]);
    assert.match(seen[0].messages[1].imageDataUrls[0], /^data:image\/png;base64,/);
    const persisted = await readFile(storePath, "utf8");
    assert.equal(persisted.includes(tinyPng), false, "raw image data must not be persisted");
    assert.equal(persisted.includes("vision-model"), true);
    const reloaded = new CollectiblesAssessmentOffice({ router, storePath });
    await reloaded.initialize();
    assert.equal(reloaded.list()[0].id, report.id);
  });
});

test("rejects spoofed photo types before inference", async () => {
  await withOffice(async ({ office, seen }) => {
    await assert.rejects(office.assess({ ...payload,
      photos: [{ ...picture, mimeType: "image/jpeg" }] }), /signature/);
    assert.equal(seen.length, 0);
  });
});

test("requires photographs and supported categories; never invents a grade on errors", async () => {
  await withOffice(async ({ office, seen }) => {
    await assert.rejects(office.assess({ ...payload, category: "weapon" }), /Unsupported/);
    await assert.rejects(office.assess({ ...payload, photos: [] }), /photographs/);
    assert.equal(office.list().length, 0);
    assert.equal(seen.length, 0);
  });
});

test("does not apply card grading numerics to antiques", async () => {
  await withOffice(async ({ office }) => {
    const report = await office.assess({ ...payload, category: "antique", itemName: "Test antique" });
    assert.equal(report.condition.gradeEstimate, null);
    assert.equal(report.authenticity.status, "unverified");
  });
});

test("rejects invalid model output rather than recording a fabricated conclusion", async () => {
  await withOffice(async ({ office, storePath }) => {
    await assert.rejects(office.assess(payload), /valid numeric range/);
    assert.equal(office.list().length, 0);
    await assert.rejects(readFile(storePath), { code: "ENOENT" });
  }, { ...response, condition: { ...response.condition,
      gradeEstimate: { basis: "photo_estimate", low: 12, high: 15, confidence: "high" } } });
});

test("fails closed when the configured model cannot perform vision", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kings-collectibles-"));
  try {
    const office = new CollectiblesAssessmentOffice({
      storePath: join(dir, "reports.json"),
      router: { route: async () => ({ success: false, code: "NO_ROUTABLE_MODEL" }) },
    });
    await office.initialize();
    await assert.rejects(office.assess(payload), /NO_ROUTABLE_MODEL/);
    assert.equal(office.list().length, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
