// Ground-truth evaluation for POWERHOUSE collectibles assessments.
// Input cases must come from independently reviewed real items, not generated labels.
export function evaluateCollectibleReports(cases) {
  if (!Array.isArray(cases) || cases.length === 0) throw new Error("At least one expert-reviewed case is required.");
  const categories = new Map();
  let graded = 0, covered = 0, errorSum = 0, withinOne = 0, unverified = 0;
  for (const item of cases) {
    if (!item || typeof item !== "object" || !["tcg", "sports_card", "comic", "antique", "collectible"].includes(item.category)) {
      throw new Error("Invalid evaluation category");
    }
    if (!item.expert || item.expert.reviewed !== true || typeof item.expert.reviewer !== "string" ||
        !item.expert.reviewer.trim() || typeof item.expert.evidenceId !== "string" || !item.expert.evidenceId.trim()) {
      throw new Error("Expert-reviewed provenance and reviewer identity required");
    }
    if (!item.report || item.report.category !== item.category || !item.report.condition ||
        !item.report.authenticity || item.report.authenticity.status !== "unverified") {
      throw new Error("Report category and authenticity safeguards must match");
    }
    const entry = categories.get(item.category) ?? { total: 0, graded: 0, covered: 0, absoluteError: 0, withinOne: 0 };
    entry.total++;
    const estimate = item.report.condition.gradeEstimate;
    if (item.category === "antique" || item.category === "collectible") {
      if (estimate !== null) throw new Error("Non-standard collectibles must not receive universal numeric grades");
    } else {
      const expertGrade = item.expert.grade;
      if (typeof expertGrade !== "number" || !Number.isFinite(expertGrade) || expertGrade < (item.category === "comic" ? 0.5 : 1) || expertGrade > 10) {
        throw new Error("A validated expert grade is required for numeric-grade categories");
      }
      graded++; entry.graded++;
      if (estimate !== null) {
        if (!Number.isFinite(estimate.low) || !Number.isFinite(estimate.high) || estimate.low > estimate.high ||
            estimate.low < (item.category === "comic" ? 0.5 : 1) || estimate.high > 10) {
          throw new Error("Invalid estimated grade range");
        }
        covered++; entry.covered++;
        const center = (estimate.low + estimate.high) / 2;
        const error = Math.abs(center - expertGrade);
        errorSum += error; entry.absoluteError += error;
        if (error <= 1) { withinOne++; entry.withinOne++; }
      }
    }
    unverified++;
    categories.set(item.category, entry);
  }
  const categoryResults = {};
  for (const [name, value] of categories) {
    categoryResults[name] = {
      cases: value.total, expertGraded: value.graded, estimated: value.covered,
      meanAbsoluteError: value.covered ? value.absoluteError / value.covered : null,
      withinOneGradeRate: value.covered ? value.withinOne / value.covered : null,
      estimateCoverage: value.graded ? value.covered / value.graded : null,
    };
  }
  return {
    source: "independent_expert_labels",
    cases: cases.length,
    expertGraded: graded,
    estimated: covered,
    meanAbsoluteError: covered ? errorSum / covered : null,
    withinOneGradeRate: covered ? withinOne / covered : null,
    estimateCoverage: graded ? covered / graded : null,
    authenticitySafeguardRate: unverified / cases.length,
    byCategory: categoryResults,
    // No accuracy claim can be made if no real expert-reviewed items are supplied.
    benchmarkReady: graded >= 30 && ["tcg", "sports_card", "comic"].every(k => (categories.get(k)?.graded ?? 0) >= 10),
  };
}
