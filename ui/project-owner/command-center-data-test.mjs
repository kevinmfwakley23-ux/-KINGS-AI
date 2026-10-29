import assert from "node:assert/strict";
import { commandCenterSnapshot, fetchCommandCenterGitHub } from "./command-center-data.mjs";

const snapshot = commandCenterSnapshot({
  workspace: "/repo",
  missions: [
    {
      mission: { id: "mission-1", name: "Real mission", status: "active" },
      tasks: [
        { id: "t1", name: "Inspect", status: "completed" },
        { id: "t2", name: "Build", status: "running", assignedAgentId: "worker-1" },
      ],
      results: [{ agentId: "worker-1", status: "completed" }],
    },
  ],
  executionJob: { status: "running", missionId: "mission-1" },
  engineeringJob: null,
  providerOrder: ["omniroute", "9router", "ollama-internal"],
  availableProviders: ["omniroute"],
});
assert.equal(snapshot.source, "live-owner-runtime");
assert.deepEqual(snapshot.totals, {
  missions: 1, completedMissions: 0, failedMissions: 0,
  tasks: 2, runningTasks: 1, completedTasks: 1,
});
assert.deepEqual(snapshot.agents, [
  { id: "worker-1", status: "running", completedResults: 1 },
]);
assert.equal(snapshot.providers.configured[0], "omniroute");
assert.equal(snapshot.offices.find((x) => x.id === "collectibles").integration, "not-yet-connected");

let calls = [];
const token = "super-secret-owner-github-token";
const github = await fetchCommandCenterGitHub({
  token,
  fetcher: async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      async json() {
        if (url.endsWith("/actions/runs?per_page=6")) return {
          workflow_runs: [{ id: 7, name: "CI", status: "completed", conclusion: "failure", head_branch: "main", head_sha: "0123456789abcdef", created_at: "2026-10-28T00:00:00Z", html_url: "https://github.com/owner/repo/actions/runs/7" }],
        };
        return { default_branch: "main", pushed_at: "2026-10-28T00:00:00Z" };
      },
    };
  },
});
assert.equal(github.ok, true);
assert.equal(github.workflows[0].conclusion, "failure", "failed CI must never display as success");
assert.equal(github.workflows[0].sha, "0123456789ab");
assert.equal(calls.length, 2);
for (const call of calls) {
  assert.ok(call.url.startsWith("https://api.github.com/repos/kevinmfwakley23-ux/-KINGS-AI"));
  assert.equal(call.options.headers.authorization, "Bearer " + token);
  assert.equal(call.options.redirect, "error");
}
assert.ok(!JSON.stringify(github).includes(token), "secrets cannot escape in response");

const failed = await fetchCommandCenterGitHub({ fetcher: async () => ({ ok: false, status: 403 }) });
assert.equal(failed.ok, false);
assert.match(failed.error, /HTTP 403/);
assert.deepEqual(failed.workflows, []);
console.log("K.I.N.G.S. command center live projections and read-only GitHub transport: SUCCESS");
