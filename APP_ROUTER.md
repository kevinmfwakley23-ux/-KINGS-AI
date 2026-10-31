# K.I.N.G.S. Shared App AI Router

K.I.N.G.S. AI is the shared AI-routing core for K.I.N.G.S. applications. Product apps such as Collector's Kingdom and Author's Forge keep their own domain rules, user data, and workflows, while AI model/provider selection remains centralized behind K.I.N.G.S. AI.

## Architectural rule

K.I.N.G.S. apps use the governed K.I.N.G.S. provider boundary. **Sovereign local inference is now the default** under the owner's independent-model directive. The K.I.N.G.S. router and workforce remain first-party and do not invoke outside AI agents. Public internet research is a distinct, explicitly requested tool operation and does not authorize external inference. Model and research credentials belong to the owner-controlled runtime, never browser code.

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

Routes a native K.I.N.G.S. model request through the provider registry. Example:

```json
{
  "appId": "kings.collectors.kingdom",
  "messages": [
    { "role": "user", "content": "Summarize the market context for this collectible." }
  ],
  "requiredCapabilities": ["reasoning", "research"],
  "maxOutputTokens": 800
}
```

The response includes the selected provider/model, normalized token usage, tool-call proposals when a provider actually supports them, and a routing-attempt trail. Tool proposals are data only at this boundary; product applications remain responsible for authorizing and executing domain tools.

### `POST /responses` and `POST /v1/responses`

Provides the Responses-compatible contract used by Author's Forge and other K.I.N.G.S. applications. Callers should send a validated application identity in `x-kings-app-id`; `authors.forge` remains the backwards-compatible default for older Forge callers. The application identity is carried into routing, mission/task context, telemetry, and the returned `app_id`.

Callers may select one of the seven governed Powerhouse service contracts with
`service_domain`: `chat`, `coding`, `collectibles`, `sports-cards`,
`book-editing`, `publishing`, or `storytelling`. A selected contract adds a
server-owned instruction, requires the appropriate registered model
capabilities, clamps temperature to the domain ceiling, and returns the applied
domain, policy version, and required capabilities as evidence.

```json
{
  "model": "auto",
  "service_domain": "sports-cards",
  "input": "Analyze the supplied card details and completed sales without inventing a grade.",
  "temperature": 0.8,
  "max_output_tokens": 1200
}
```

The domain contract governs routing and response standards; it is not proof that
a selected model is an expert. Model quality still requires measured,
domain-specific evaluation.

### `GET /v1/powerhouse/domains`

Returns the seven registered service domains, policy version, required model
capabilities, and maximum temperature. This authenticated discovery endpoint
explicitly distinguishes active routing policy from verified expert status. It
also returns the separate qualification policy: every domain needs at least 20
rights-cleared, held-out, training-disjoint tasks, an 85% pass rate, zero
critical failures, and verified prerequisite capabilities with evidence.
Production qualification alone does not authorize a top-tier claim. That claim
requires independent comparative evidence for every domain at or above the 90th
percentile against at least five peer models.

## Routing behavior

- Provider order is controlled by `KINGS_APP_ROUTER_PROVIDER_ORDER`.
- Default mode is `KINGS_INTELLIGENCE_MODE=sovereign`, with provider order `ollama-internal`. No external model gateways are registered, even if their credentials are configured.
- `KINGS_INTELLIGENCE_MODE=hybrid` is an explicit opt-in that restores `omniroute,9router,ollama-internal` as the default routing order. Hybrid mode does not meet the owner's independent-model-only production requirement.
- Sovereign deployments require an owner-operated local or self-hosted model configured through `KINGS_OLLAMA_BASE_URL` and `KINGS_OLLAMA_MODEL`. Missing models return a routing failure; never pretend a model is available.
- `KINGS_OLLAMA_CONTEXT_TOKENS` is an actual optional `num_ctx` runtime option (1024–131072), not a promise that every model or device can handle that context. Training/deployment instructions: [Sovereign inference and training](docs/SOVEREIGN_INFERENCE_AND_TRAINING.md).
- Owner-approved web research stays within the existing HTTPS-only, private-network-blocking research gateway. Retrieved web text is evidence, not automatically training data.
- A caller may request an explicit provider or model when required.
- Automatic routing filters out models that do not declare the requested capabilities/modalities.
- Powerhouse service-domain requests add server-controlled capability requirements; callers cannot weaken them by supplying a generic capability list.
- Domain temperature ceilings prevent fact-sensitive services from silently accepting highly speculative generation settings.
- If an automatic candidate fails, K.I.N.G.S. can try the next eligible configured provider.
- If an explicit provider is requested, K.I.N.G.S. does not silently substitute a different provider.
- OmniRoute and 9Router remain provider adapters behind K.I.N.G.S.; their own virtual-model routing, fallback, caching, and quota logic remains intact.
- `ollama-internal` uses the existing real Ollama execution client and is registered only when local Ollama configuration is explicitly supplied.

## Local/offline Ollama lane

A K.I.N.G.S. runtime can route app requests to a locally running Ollama server without creating a second product-specific AI stack.

Example configuration:

```bash
export KINGS_OLLAMA_BASE_URL=http://127.0.0.1:11434
export KINGS_OLLAMA_MODEL=qwen2.5-coder:0.5b
# Or configure multiple installed models:
# export KINGS_OLLAMA_MODELS=qwen2.5-coder:0.5b,qwen2.5-coder:1.5b

npm run start:router
```

Optional controls:

```bash
export KINGS_OLLAMA_TIMEOUT_MS=60000
export KINGS_OLLAMA_CAPABILITIES=reasoning,planning,coding,debugging,research,source-inspection,verification,recovery
```

For a deliberately local-only router, configure only Ollama and set:

```bash
export KINGS_APP_ROUTER_PROVIDER_ORDER=ollama-internal
```

The current Ollama adapter is text-only and does **not** claim structured-output or model-native tool-call support. Requests requiring capabilities it cannot provide fail routing rather than being misrepresented as supported. Local execution reports zero provider cost because inference runs on the operator's own Ollama runtime; hardware/electricity costs are outside the model-usage accounting contract.

## Security boundary

The router binds to loopback by default. Binding it to a non-loopback interface requires `KINGS_APP_ROUTER_TOKEN`; startup fails closed without a token. App backends should call K.I.N.G.S. AI server-to-server so provider and router credentials never need to be exposed to browser JavaScript.

The app router does not execute tool calls on behalf of a product app. This avoids allowing a model response to bypass each product's authorization, ownership, audit, and business-rule boundaries.

Local Ollama is not enabled merely because Ollama-related code exists. `KINGS_OLLAMA_BASE_URL` plus at least one configured model are required before `ollama-internal` is registered. Hosted deployments therefore do not falsely report local AI availability.

## Current scope

The shared gateway exposes configured OmniRoute, 9Router, and opt-in local Ollama adapters through one app-facing contract. K.I.N.G.S. remains the provider-routing authority, while Author's Forge and Collector's Kingdom remain responsible for their product data, domain rules, permissions, and user workflows.
