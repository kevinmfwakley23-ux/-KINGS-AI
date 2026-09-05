# K.I.N.G.S. Shared App AI Router

K.I.N.G.S. AI is the shared AI-routing core for K.I.N.G.S. applications. Product apps such as Collector's Kingdom and Author's Forge should keep their own domain rules, user data, and workflows, while AI model/provider selection remains centralized behind K.I.N.G.S. AI.

## Architectural rule

K.I.N.G.S. apps must not grow separate provider-routing stacks unless an explicitly approved offline/degraded mode requires one. Provider credentials belong in the K.I.N.G.S. AI runtime, not in browser code and not duplicated across product repositories.

The first app-facing gateway is exposed by the app-router runtime:

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

## Routing behavior

- Provider order is controlled by `KINGS_APP_ROUTER_PROVIDER_ORDER`.
- A caller may request an explicit provider or model when required.
- Automatic routing filters out models that do not declare the requested capabilities/modalities.
- If an automatic candidate fails, K.I.N.G.S. can try the next eligible configured provider.
- If an explicit provider is requested, K.I.N.G.S. does not silently substitute a different provider.
- OmniRoute and 9Router remain provider adapters behind K.I.N.G.S.; their own virtual-model routing, fallback, caching, and quota logic remains intact.

## Security boundary

The router binds to loopback by default. Binding it to a non-loopback interface requires `KINGS_APP_ROUTER_TOKEN`; startup fails closed without a token. App backends should call K.I.N.G.S. AI server-to-server so provider and router credentials never need to be exposed to browser JavaScript.

The app router does not execute tool calls on behalf of a product app. This avoids allowing a model response to bypass each product's authorization, ownership, audit, and business-rule boundaries.

## Current scope

This gateway currently exposes the configured OpenAI-compatible K.I.N.G.S. provider adapters (including OmniRoute and 9Router) through one app-facing contract. K.I.N.G.S.' existing internal/local intelligence remains a first-class part of the broader workforce architecture; bringing that local provider path into this same cross-app gateway should be done through the provider registry rather than by product apps calling Ollama directly.
