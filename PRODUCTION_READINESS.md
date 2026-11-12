# Production / Cross-Platform Readiness

K.I.N.G.S. is configured for Node.js 22+ and Python 3.11+ on Windows, macOS, and Linux.

## Start

1. `npm ci`
2. Configure environment variables from `.env.example` in your shell/secret manager.
3. Optional local AI: run Ollama.
4. Optional routed AI: run OmniRoute and/or 9Router and configure their base URL, model aliases, and API key.
5. `npm run verify`
6. `npm start`
7. Open `http://127.0.0.1:8787`.

The owner console intentionally defaults to loopback. A non-loopback bind now
fails closed unless `KINGS_CODING_MACHINE_TOKEN` contains at least 24 characters.
For phone/tablet or other remote access, place the owner console behind a trusted
HTTPS reverse proxy/tunnel, set `KINGS_CODING_MACHINE_BIND=0.0.0.0`, and provide
the owner token through your secret manager.

**Remote browser access is not production-ready on the default branch.**
Do not place `KINGS_CODING_MACHINE_TOKEN` in a URL, query string, browser
history, screenshot, chat message, or client-side bundle. In particular, do not
use the legacy `/?access=...` bootstrap route: a subsequent redirect and
cookie do not undo credential exposure in the initial request.

The default-branch implementation may still accept this legacy URL-token route;
this documentation change does **not** disable it. Keep the owner console
loopback-only or behind an owner-controlled private network until the URL-token
rejection and short-lived signed-session changes in review PRs #54 and #55 are
integrated, tested together, and deployed over HTTPS. Do not treat either draft
PR's isolated CI as production authorization.

For non-browser administrative clients, the owner API supports Bearer credentials
over an authenticated HTTPS connection. Never embed the owner master token in
distributed Android, desktop, or tablet clients or share it with family members.
Use separately issued, revocable, least-privilege family credentials when that
flow is verified and deployed. `/health` is a minimal unauthenticated
infrastructure probe; owner UI and `/api/status` require authentication in
remote mode.

Do not expose the owner console through plain public HTTP. A firewall is useful
defense in depth but is not a substitute for K.I.N.G.S.' application-layer owner
authentication and HTTPS transport.

## AI connectors

`core/workforce/openai-compatible-gateway.ts` provides a provider-neutral
OpenAI-compatible adapter. OmniRoute and 9Router factories preserve the virtual
model id sent to each router, allowing their own provider selection, fallback,
quota, caching, and token-efficiency features to remain in control.

OmniRoute defaults to `auto/coding,auto/cheap`. 9Router defaults to `auto`.
Override model aliases with `KINGS_OMNIROUTE_MODELS` and
`KINGS_9ROUTER_MODELS`.

Ollama remains the local/offline provider. Its execution adapter now records
`prompt_eval_count` and `eval_count` and forwards the request output-token cap
as Ollama `num_predict`, so token budgeting is no longer reported as zero.

## Token efficiency

Existing context-budget and memory-context-budget authorities are unchanged.
The new gateway transport also:
- forwards `maxOutputTokens` to OpenAI-compatible `max_tokens`;
- records prompt/completion/total usage returned by the router;
- leaves router-side caching and fallback enabled by default;
- does not set OmniRoute's no-cache header unless explicitly requested.

## Cross-platform CI

`.github/workflows/cross-platform.yml` runs install, platform checks and the
deterministic test suite on Ubuntu, Windows and macOS. The deterministic suite
also starts real owner-console processes to verify that non-loopback mode fails
closed without a token, anonymous owner requests are rejected, browser bootstrap
creates only the secure digest session cookie, and Bearer access remains valid.

## External verification still required

A repository test can verify connector contracts but cannot prove your local or
cloud provider accounts are live. Run `npm run test:live` on a machine with
CrewAI/Ollama and any required external services configured. Use the owner
console `/api/status` page to verify local reachability of Ollama, OmniRoute
and 9Router.

Never commit API keys or owner access tokens. `.env` files are ignored.
