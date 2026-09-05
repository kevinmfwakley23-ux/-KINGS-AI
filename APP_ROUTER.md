# K.I.N.G.S. Shared App AI Router

K.I.N.G.S. AI is the shared AI-routing and governed intelligence core for K.I.N.G.S. applications. Product apps such as Collector's Kingdom and Author's Forge keep their own domain rules, user data, authorization, and workflows, while model/provider selection and approved cross-app intelligence primitives remain centralized behind K.I.N.G.S. AI.

## Architectural rule

K.I.N.G.S. apps must not grow separate provider-routing or unrestricted web-access stacks unless an explicitly approved offline/degraded mode requires one. Provider credentials belong in the K.I.N.G.S. AI runtime, not in browser code and not duplicated across product repositories.

Product-owned private records remain product-owned. The app brain boundary may rank authorized memory candidates supplied by a product, but this gateway does **not** claim to persist those private memories. Durable product facts must remain in the product's authoritative data store unless a separate K.I.N.G.S. persistent-memory contract is explicitly implemented and verified.

The app-facing gateway is exposed by the app-router runtime:

```bash
npm run start:router
```

Default local endpoint:

```text
http://127.0.0.1:8790
```

## Endpoints

### `GET /health`

Returns basic router health and the registered available provider ids. It does not expose provider credentials.

### `GET /v1/models`

Returns the model identities registered in the K.I.N.G.S. provider registry. When `KINGS_APP_ROUTER_TOKEN` is configured, this endpoint requires the bearer token.

### `POST /v1/route`

Routes a model request through the K.I.N.G.S. provider registry. Example request:

```json
{
  "appId": "kings.collectors",
  "messages": [
    { "role": "user", "content": "Summarize the market context for this collectible." }
  ],
  "requiredCapabilities": ["reasoning", "research"],
  "maxOutputTokens": 800
}
```

The response includes the selected provider/model, normalized token usage, tool-call proposals, and a routing-attempt trail. Tool proposals are data only at this boundary; product applications remain responsible for authorizing and executing domain tools.

### `POST /v1/brain/memory/select`

Ranks product-supplied memory candidates using the K.I.N.G.S. memory-context and relevance authorities. This endpoint is deliberately stateless with respect to private product memory: the caller owns persistence and decides which candidates are authorized to leave the product boundary.

Example request:

```json
{
  "appId": "kings.collectors",
  "taskId": "keeper-question-42",
  "missionId": "collector-vault-user-123",
  "query": "What do I already know about this signed jersey?",
  "inputReferences": ["vault:treasure:jersey-1"],
  "memories": [
    {
      "id": "memory-1",
      "type": "semantic",
      "summary": "The collector recorded a JSA authentication document for this jersey.",
      "sourceReferences": ["vault:treasure:jersey-1", "evidence:jsa-doc-1"],
      "missionId": "collector-vault-user-123",
      "authoritative": true,
      "createdAt": "2026-09-04T18:00:00.000Z",
      "updatedAt": "2026-09-04T18:00:00.000Z"
    }
  ],
  "limit": 8
}
```

K.I.N.G.S. rejects memory candidates without provenance. Results include the selected memory records, scores, and human-readable ranking reasons. The product remains responsible for enforcing collector authorization before supplying candidates.

### `POST /v1/brain/research/retrieve`

Performs governed retrieval of explicitly supplied public HTTPS sources using the existing K.I.N.G.S. web-access and external-research adapters.

Example request:

```json
{
  "appId": "kings.collectors",
  "taskId": "valuation-research-17",
  "question": "What does this public sold-listing source establish?",
  "urls": [
    "https://example.com/public-source"
  ],
  "maxSources": 4
}
```

This is **retrieval, not search-engine discovery and not automatic fact verification**. The result contains bounded source records and provenance. `findings` remains empty at this retrieval stage. A product may then send the authorized retrieved material through `/v1/route` for synthesis, comparison, or verification while preserving the source records separately.

Research retrieval inherits K.I.N.G.S. web-access protections:

- HTTPS only;
- GET only;
- embedded URL credentials rejected;
- private, loopback, link-local, multicast, and other blocked network ranges rejected;
- DNS resolution checked before retrieval;
- redirects rejected rather than followed automatically;
- bounded response size;
- bounded request timeout;
- optional public-host allowlist;
- per-request source-count cap.

Configuration:

- `KINGS_APP_RESEARCH_MAX_SOURCES` (default `8`, maximum `50`)
- `KINGS_APP_RESEARCH_MAX_RESPONSE_BYTES` (default `524288`)
- `KINGS_APP_RESEARCH_TIMEOUT_MS` (default `15000`)
- `KINGS_APP_RESEARCH_ALLOWED_HOSTS` (optional comma-separated host allowlist)

## Routing behavior

- Provider order is controlled by `KINGS_APP_ROUTER_PROVIDER_ORDER`.
- A caller may request an explicit provider or model when required.
- Automatic routing filters out models that do not declare the requested capabilities/modalities.
- If an automatic candidate fails, K.I.N.G.S. can try the next eligible configured provider.
- If an explicit provider is requested, K.I.N.G.S. does not silently substitute a different provider.
- OmniRoute and 9Router remain provider adapters behind K.I.N.G.S.; their own virtual-model routing, fallback, caching, and quota logic remains intact.
- Product apps remain free to select weaker, cheaper, free, or explicit models. K.I.N.G.S. verification/adjudication may evaluate their output without removing collector control over cost/quality choices.

## Security boundary

The router binds to loopback by default. Binding it to a non-loopback interface requires `KINGS_APP_ROUTER_TOKEN`; startup fails closed without a token. App backends should call K.I.N.G.S. AI server-to-server so provider and router credentials never need to be exposed to browser JavaScript.

The app router does not execute product-domain tool calls on behalf of an application. This avoids allowing a model response to bypass each product's authorization, ownership, audit, and business-rule boundaries.

The memory-selection route is not an authorization service. Product apps must select and redact candidates before sending them to K.I.N.G.S. AI.

The research-retrieval route does not grant access to private product resources or local network services. Its web policy blocks private/local network targets and only accepts public HTTPS retrieval.

## Current scope

The gateway exposes configured OpenAI-compatible provider adapters (including OmniRoute and 9Router), deterministic provenance-aware memory selection, and governed public-source retrieval through one app-facing contract. K.I.N.G.S.' broader internal/local intelligence remains a first-class part of the workforce architecture; future app-facing capabilities should be exposed by adapting those existing authorities rather than reimplementing them in product repositories.
