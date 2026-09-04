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

To expose the owner console to other trusted devices on your LAN, set
`KINGS_CODING_MACHINE_BIND=0.0.0.0` and protect the network boundary with a
firewall/reverse proxy. The owner console intentionally defaults to loopback.

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
deterministic test suite on Ubuntu, Windows and macOS.

## External verification still required

A repository test can verify connector contracts but cannot prove your local or
cloud provider accounts are live. Run `npm run test:live` on a machine with
CrewAI/Ollama and any required external services configured. Use the owner
console `/api/status` page to verify local reachability of Ollama, OmniRoute
and 9Router.

Never commit API keys. `.env` files are ignored.
