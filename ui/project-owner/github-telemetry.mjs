// Read-only GitHub telemetry. Never send credentials or raw provider responses to browsers.
const DEFAULT_REPOSITORY = "kevinmfwakley23-ux/-KINGS-AI";
export async function githubCommandCenterSnapshot({
  token = process.env.KINGS_GITHUB_TOKEN,
  repository = DEFAULT_REPOSITORY,
  fetchImpl = fetch,
  timeoutMs = 5000,
} = {}) {
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository)) {
    throw new Error("Invalid configured GitHub repository");
  }
  const headers = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
  async function get(path) {
    const response = await fetchImpl(
      `https://api.github.com/repos/${repository}${path}`,
      { headers, signal: AbortSignal.timeout(timeoutMs) },
    );
    if (!response.ok) throw new Error(`GitHub telemetry request failed (HTTP ${response.status})`);
    return response.json();
  }
  const [repo, runs, pulls] = await Promise.all([
    get(""),
    get("/actions/runs?per_page=10"),
    get("/pulls?state=open&per_page=10"),
  ]);
  return {
    source: "github",
    fetchedAt: new Date().toISOString(),
    repository: repo.full_name,
    defaultBranch: repo.default_branch,
    latestPushAt: repo.pushed_at ?? null,
    workflows: (runs.workflow_runs ?? []).map((run) => ({
      id: run.id,
      name: run.name,
      status: run.status,
      conclusion: run.conclusion,
      branch: run.head_branch,
      createdAt: run.created_at,
      url: run.html_url,
    })),
    pullRequests: pulls.map((pr) => ({
      number: pr.number,
      title: pr.title,
      draft: pr.draft,
      updatedAt: pr.updated_at,
      url: pr.html_url,
    })),
  };
}
