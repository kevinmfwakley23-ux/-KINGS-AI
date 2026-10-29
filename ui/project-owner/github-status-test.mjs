import assert from "node:assert/strict";
import { test } from "node:test";
import { createGitHubStatusReader } from "./github-status.mjs";

test("returns real-source shaped telemetry without exposing credentials", async () => {
  const urls = [];
  const reader = createGitHubStatusReader({
    repository: "example/repo", token: "secret-do-not-expose",
    fetchImpl: async (url, options) => {
      urls.push(url);
      assert.equal(options.headers.Authorization, "Bearer secret-do-not-expose");
      return { ok: true, json: async () => url.endsWith("/actions/runs?per_page=10")
        ? { workflow_runs: [{ id: 3, name: "CI", status: "completed", conclusion: "success" }] }
        : url.includes("/pulls?") ? [{ number: 4, title: "Feature", draft: false }]
        : { full_name: "example/repo", default_branch: "main" } };
    }
  });
  const result = await reader.snapshot();
  assert.equal(result.source, "github");
  assert.equal(result.latestRuns[0].id, 3);
  assert.equal(result.openPullRequests[0].number, 4);
  assert.equal(JSON.stringify(result).includes("secret-do-not-expose"), false);
  assert.equal(urls.length, 3);
});
test("rejects invalid repository names", () => {
  assert.throws(() => createGitHubStatusReader({ repository: "https://bad.host/path" }), /Invalid repository/);
});
test("fails closed on GitHub errors", async () => {
  const reader = createGitHubStatusReader({
    fetchImpl: async () => ({ ok: false, status: 403 })
  });
  await assert.rejects(reader.snapshot(), /GitHub telemetry HTTP 403/);
});
