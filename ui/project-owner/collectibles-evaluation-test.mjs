import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateCollectibleReports } from "./collectibles-evaluation.mjs";
const sample = (category, grade, low, high) => ({
  category,
  expert: { reviewed: true, reviewer: "independent-expert", evidenceId: "expert-evidence-001", grade },
  report: { category, authenticity: { status: "unverified" }, condition: {
    gradeEstimate: low === null ? null : { low, high }
  } },
});
test("reports coverage, expert agreement and refuses premature benchmark claims", () => {
  const result = evaluateCollectibleReports([sample("tcg", 8, 7, 9), sample("comic", 7, 4, 6), sample("antique", undefined, null, null)]);
  assert.equal(result.cases, 3);
  assert.equal(result.expertGraded, 2);
  assert.equal(result.meanAbsoluteError, 1);
  assert.equal(result.withinOneGradeRate, 0.5);
  assert.equal(result.estimateCoverage, 1);
  assert.equal(result.benchmarkReady, false);
});
test("rejects unreviewed or fabricated evaluation labels", () => {
  const input = sample("tcg", 9, 8, 10);
  delete input.expert.reviewer;
  assert.throws(() => evaluateCollectibleReports([input]), /Expert-reviewed/);
});
test("rejects numeric antique grades and authentication claims", () => {
  assert.throws(() => evaluateCollectibleReports([sample("antique", undefined, 8, 9)]), /universal numeric/);
  const item = sample("tcg", 9, 8, 10);
  item.report.authenticity.status = "verified";
  assert.throws(() => evaluateCollectibleReports([item]), /authenticity/);
});
test("tracks abstentions rather than treating them as correct guesses", () => {
  const result = evaluateCollectibleReports([sample("tcg", 8, null, null)]);
  assert.equal(result.estimated, 0);
  assert.equal(result.meanAbsoluteError, null);
  assert.equal(result.estimateCoverage, 0);
});
