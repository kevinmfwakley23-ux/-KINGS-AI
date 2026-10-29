# K.I.N.G.S. AI POWERHOUSE command center — integration checkpoint

## Scope

The live command center is an **authenticated view and control surface of the existing owner console**. It does **not** implement a second mission manager, model router, workforce, or role-based access system. It complies with the locked Architecture Gospel in the root README.

It reads persistent owner missions, task states, workforce result evidence, configured providers, the actual owner execution/verification jobs, and GitHub workflow runs. No sample records or synthetic agents are inserted into production state.

## Run

From the K.I.N.G.S. AI repository root on a Node.js 22+ machine:

```bash
npm ci
npm run verify
npm start
```

Open `http://127.0.0.1:8787/command-center`. This is loopback-only unless explicitly configured otherwise. The original owner console stays available at `/`.

For remote usage, configure `KINGS_CODING_MACHINE_BIND` and a strong `KINGS_CODING_MACHINE_TOKEN` of at least 24 characters; terminate at a trusted HTTPS reverse proxy and follow the existing secure owner-bootstrap flow. Never expose the loopback-only unauthenticated mode on the public internet.

## GitHub read-only status

The GitHub status endpoint uses a fixed target: `kevinmfwakley23-ux/-KINGS-AI`. It reads repository metadata and the latest six workflow runs via GitHub REST. `KINGS_GITHUB_TOKEN` is an **optional server-only secret**; without it, the API uses GitHub's unauthenticated public repository quota and may report a 403 rate-limit error.

Provide GitHub credentials in an environment or secret manager, **never** the page, query string, source control, or browser local storage. The response is limited to the repository name, branch, last push, CI status and links. The endpoint is owner-authenticated, has a request timeout, and caches responses for 60 seconds (30 seconds on failure). This integration **does not commit to GitHub**, control GitHub Actions, or issue arbitrary API calls.

## Real control boundaries

The interface delegates to the existing, already governed owner endpoints:

- `POST /api/missions` requires the exact `create-mission` owner action header and stores the approved mission/plan.
- `POST /api/missions/:id/execute` requires the exact `execute-mission` header and runs the configured execution service.
- `POST /api/missions/:id/retry` requires the exact `retry-mission` header and returns failed tasks to ready.
- `POST /api/engineering/readiness` and `/verify` require matching fixed owner action headers and run only approved workspace-bound operations.

A browser confirmation is not an authorization boundary. The server's owner authentication, fixed action allowlist, workspace authority, persisted mission plans and tool governance remain controlling. Execution can fail due to an unavailable configured model; the UI must show the failure rather than manufacturing completion.

The interface deliberately **does not offer generic agent pause/kill**. Such actions would require a real cancellation/safe-interruption contract with the existing worker execution runtime, durable state and tests. Likewise, a test/verify result must not be misreported as a model's training accuracy.

## Offices and completion gate

**Engineering:** real owner mission creation, execution, retry, readiness, and verification. **Research:** displays real mission results and source evidence only. **Training & CI:** shows repository-native verification and GitHub CI, not model fine-tuning. **Collectibles / Publishing:** explicitly labeled integration-pending; independent product brains remain independent of this master builder. **Security:** shows boundaries; it does not disclose secrets or grant access.

Verified UI readiness requires cross-platform `npm test` checks, remote-auth test coverage, browser/controller syntax checks, actual owner-server smoke test, real configured provider execution, and deployed browser authentication behind HTTPS. Do **not** claim full autonomous AI or production training completion from this UI checkpoint alone.
