# K.I.N.G.S. Shared App AI Router

K.I.N.G.S. AI is the shared AI-routing core for K.I.N.G.S. applications. Product apps such as Collector's Kingdom and Author's Forge keep their own domain rules, user data, and workflows, while AI model/provider selection remains centralized behind K.I.N.G.S. AI.

## Architectural rule

K.I.N.G.S. apps must not grow separate provider-routing stacks. Cloud gateways and local/offline intelligence are registered behind the same governed K.I.N.G.S. provider boundary. Provider credentials belong in the K.I.N.G.S. AI runtime, not in browser code and not duplicated across product repositories.

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

## Routing behavior

- Provider order is controlled by `KINGS_APP_ROUTER_PROVIDER_ORDER`.
- Default order is `omniroute,9router,ollama-internal`.
- A caller may request an explicit provider or model when required.
- Automatic routing filters out models that do not declare the requested capabilities/modalities.
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
