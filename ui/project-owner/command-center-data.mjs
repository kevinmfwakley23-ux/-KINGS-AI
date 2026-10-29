// Owner command center projections over the existing persistent mission runtime.
// Read-only: never changes mission state, grants capability or runs a worker.
const REPOSITORY = "kevinmfwakley23-ux/-KINGS-AI";
const API = "https://api.github.com/repos/" + REPOSITORY;

function statusOf(task) {
  return ["ready", "running", "completed", "failed", "blocked", "pending"].includes(task?.status)
    ? task.status : "unknown";
}

export function commandCenterSnapshot({ missions, executionJob, engineeringJob, providerOrder, availableProviders, workspace }) {
  const tasks = missions.flatMap((item) => (item.tasks || []).map((task) => ({
    id: task.id,
    missionId: item.mission.id,
    missionName: item.mission.name,
    name: task.name || task.description || task.id,
    status: statusOf(task),
    agentId: task.assignedAgentId || null,
  })));
  const resultAgentIds = new Set(missions.flatMap((item) => (item.results || []).map((result) => result.agentId).filter(Boolean)));
  const activeAgentIds = new Set(tasks.filter((task) => task.status === "running" && task.agentId).map((task) => task.agentId));
  const agents = [...new Set([...resultAgentIds, ...activeAgentIds])].sort().map((id) => ({
    id,
    status: activeAgentIds.has(id) ? "running" : "not running",
    completedResults: missions.reduce((total, item) => total + (item.results || []).filter((result) => result.agentId === id && result.status === "completed").length, 0),
  }));
  return {
    ok: true,
    source: "live-owner-runtime",
    generatedAt: new Date().toISOString(),
    workspace,
    totals: {
      missions: missions.length,
      completedMissions: missions.filter((item) => item.mission.status === "completed").length,
      failedMissions: missions.filter((item) => item.mission.status === "failed").length,
      tasks: tasks.length,
      runningTasks: tasks.filter((task) => task.status === "running").length,
      completedTasks: tasks.filter((task) => task.status === "completed").length,
    },
    agents,
    tasks,
    execution: executionJob,
    verification: engineeringJob,
    providers: { order: [...providerOrder], configured: [...availableProviders] },
    offices: [
      { id: "engineering", label: "Engineering", integration: "governed-missions" },
      { id: "research", label: "Research", integration: "mission-evidence" },
      { id: "training", label: "Training & evaluations", integration: "verification-and-ci" },
      { id: "collectibles", label: "Collectibles", integration: "not-yet-connected" },
      { id: "publishing", label: "Publishing", integration: "not-yet-connected" },
    ],
  };
}

// Fixed, read-only GitHub API target. Token is server-side and never returned.
export async function fetchCommandCenterGitHub({ fetcher = fetch, token = process.env.KINGS_GITHUB_TOKEN } = {}) {
  const headers = {
    "accept": "application/vnd.github+json",
    "user-agent": "KINGS-AI-owner-command-center",
    "x-github-api-version": "2022-11-28",
  };
  if (token) headers.authorization = "Bearer " + token;
  async function get(path) {
    const response = await fetcher(API + path, { headers, signal: AbortSignal.timeout(5000), redirect: "error" });
    if (!response.ok) throw new Error("GitHub API returned HTTP " + response.status);
    return response.json();
  }
  try {
    const [repo, runs] = await Promise.all([get(""), get("/actions/runs?per_page=6")]);
    return {
      ok: true,
      source: "github-rest-api",
      repository: REPOSITORY,
      url: "https://github.com/" + REPOSITORY,
      defaultBranch: repo.default_branch || null,
      updatedAt: repo.pushed_at || null,
      workflows: Array.isArray(runs.workflow_runs) ? runs.workflow_runs.map((run) => ({
        id: run.id,
        name: run.name,
        status: run.status,
        conclusion: run.conclusion,
        branch: run.head_branch,
        sha: typeof run.head_sha === "string" ? run.head_sha.slice(0, 12) : null,
        createdAt: run.created_at,
        url: run.html_url,
      })) : [],
    };
  } catch (error) {
    return {
      ok: false, source: "github-rest-api", repository: REPOSITORY,
      error: error instanceof Error ? error.message : "GitHub is unavailable",
      workflows: [],
    };
  }
}
