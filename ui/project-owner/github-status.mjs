// Read-only GitHub telemetry adapter for the existing owner console.
// No GitHub token is ever sent to a browser. No agent control is simulated here.
const DEFAULT_REPO = "kevinmfwakley23-ux/-KINGS-AI";
export function createGitHubStatusReader({ repository = DEFAULT_REPO, token = process.env.KINGS_GITHUB_TOKEN, fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error("Invalid repository");
  const base = "https://api.github.com/repos/" + repository;
  async function request(path) {
    const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "KINGS-Powerhouse-Command-Center" };
    if (token) headers.Authorization = "Bearer " + token;
    const response = await fetchImpl(base + path, { headers, signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error("GitHub telemetry HTTP " + response.status);
    return response.json();
  }
  return {
    async snapshot() {
      const [repositoryInfo, runs, pullRequests] = await Promise.all([
        request(""),
        request("/actions/runs?per_page=10"),
        request("/pulls?state=open&per_page=20")
      ]);
      return {
        source: "github",
        observedAt: new Date().toISOString(),
        repository: repositoryInfo.full_name,
        defaultBranch: repositoryInfo.default_branch,
        latestRuns: (runs.workflow_runs ?? []).map(run => ({
          id: run.id, name: run.name, status: run.status, conclusion: run.conclusion,
          branch: run.head_branch, url: run.html_url, createdAt: run.created_at
        })),
        openPullRequests: (pullRequests ?? []).map(pr => ({
          number: pr.number, title: pr.title, draft: pr.draft,
          url: pr.html_url, updatedAt: pr.updated_at
        }))
      };
    }
  };
}
