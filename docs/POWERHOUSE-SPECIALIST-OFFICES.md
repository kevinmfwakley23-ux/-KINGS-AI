# K.I.N.G.S. AI POWERHOUSE — Specialist Offices, Evaluation, and Reviewed Training Data

## Architectural owner

This feature belongs INSIDE the existing `kevinmfwakley23-ux/-KINGS-AI` POWERHOUSE repository. It extends the authenticated `ui/project-owner/server.mjs` owner console and reuses its `OwnerMissionExecutionService.router` (existing K.I.N.G.S. Brain Core). It does **not** create a new provider registry, memory database, autonomous write authority, or mandatory runtime dependency for Author's Forge / Collector's Kingdom.

## Real office features

- `/specialists`: mobile-friendly owner-authenticated conversational interface and office switcher.
- `/api/specialists`: authenticated read-only list of available offices.
- `/api/specialists/chat`: authenticated, explicitly confirmed POST with mode and bounded user/assistant conversation. Returns model response and provider/model/request/usage attribution.
- Modes: general chat, engineering/code, collectibles, sports cards/TCG, book editing, publishing, and fiction/storytelling.
- `/collectibles`: the separate real photographic assessment workflow from the stacked Collectibles Intelligence implementation.
- No specialist chat response runs shell commands, mutates files, authenticates collectibles, publishes books, or changes the repository. Real engineering writes still require the existing owner-governed mission execution workflow.
- No provider is hardcoded as successful. If router/provider is absent or fails, API returns a real failure instead of a synthetic answer.
- Server-side backpressure limits specialist inference to two concurrent calls and 30 calls per rolling minute per owner-console process; excess requests return HTTP 429 without making provider calls. These are console-wide limits, not a substitute for per-user permissions or token/cost budgets.
- Chat history stays in the browser tab. Persistent cross-session conversation memory has NOT been added; the existing durable Project Brain and memory architecture must be used when that feature is implemented.

### Local launch (after branch checkout and successful build)

    npm ci
    npm run verify
    npm start

Open the authenticated owner console then follow **AI Specialist Offices**. In local loopback mode, the default address is `http://127.0.0.1:8787/specialists`. Remote/mobile access requires the existing secure owner token and trusted HTTPS transport. Never expose or commit owner access codes, API tokens or `.env` files.

Routed models are server-configured using the existing `KINGS_OMNIROUTE_*`, `KINGS_9ROUTER_*` and fallback provider environment. Accuracy depends on the actual model, context and reference data. A system prompt or successful HTTP response is not independent model training or proof of expert quality.

## Measurable live evaluation

Run the complete deterministic test suite:

    npm run verify

The unit/HTTP tests verify request validation, authentication, provider transport, and error handling using controlled test responses. They do not establish state-of-the-art intelligence.

To spend real model capacity on seven repeatable observational checks, explicitly opt in:

    KINGS_SPECIALIST_LIVE_EVAL=1 npm run evaluate:specialists

Results are written to the gitignored `.kings/specialist-evaluation-latest.json` by default, with prompt, response, deterministic checks, provider/model ID, elapsed time and failure information. `KINGS_SPECIALIST_EVALUATION_REPORT` can override that private output path. The check suite probes arithmetic, concrete coding syntax, refusal of unverified authentication and market prices, editing tense, publishing-compliance uncertainty, and creative prose. It is a **smoke benchmark only**; independent expert scorecards, coding tests in an isolated sandbox, author-quality reviews, and real catalog/market evidence are required for claims of top-tier performance.

## Owner-reviewed training preparation

The local export command prepares **fine-tuning data**, not trained model weights:

    npm run prepare:specialist-training -- --input ./owner-reviewed.json --output ./.kings/specialist-training

Input is a JSON array with at least two objects, each shaped like:

```json
[
  {
    "id": "original-chat-example-001",
    "mode": "chat",
    "source": "owner-original-content",
    "messages": [{"role":"user","content":"What is a safe way to test new code?"}],
    "idealResponse": "Use a separate branch, isolated environment, automated tests, and review before deployment.",
    "review": {
      "approvedByOwner": true,
      "rightsConfirmed": true,
      "personalDataReviewed": true,
      "optedInForTraining": true,
      "reviewedAt": "2026-10-28T12:00:00Z"
    }
  },
  {
    "id": "original-editor-example-002",
    "mode": "editing",
    "source": "owner-original-content",
    "messages": [{"role":"user","content":"Suggest a fix for: She walk home."}],
    "idealResponse": "For past tense, change 'walk' to 'walked'. Preserve the author's sentence and voice.",
    "review": {
      "approvedByOwner": true,
      "rightsConfirmed": true,
      "personalDataReviewed": true,
      "optedInForTraining": true,
      "reviewedAt": "2026-10-28T12:00:00Z"
    }
  }
]
```

The exporter rejects missing approval/rights/privacy attestation, unsupported office, unauthorized system roles, oversized records, duplicate IDs, and repeated identical prompt/context. It generates deterministic nonoverlapping train/validation sets and file hashes in `manifest.json` for later audit. Rights and owner-review fields are **declarations by the operator**, not cryptographic proof of identity. Use only material William is authorized to train on, and review for sensitive information before export.

The exporter performs **no upload, fine-tuning, self-modification, or distribution**. A later explicit owner-approved training job will require model choice, budget, GPU/API access, provenance, evaluation baseline, regression gate, recovery and rollback. Avoid training on protected third-party manuscripts without proper rights.

## Security and deployment acceptance

1. Verify the owner-token boundary in remote mode, HTTPS termination, cross-origin/CSRF policy and privacy policy.
2. Verify real OmniRoute / 9Router model availability and inspect provider attribution; never fabricate a successful inference.
3. Execute all tests on Chromebook/Android-accessible and hosted target platforms; check GitHub Actions status before merging.
4. Establish actual accuracy benchmarks for code generation, collectible/TCG research, literary editing, publishing specifications, story craft, and multi-turn chatbot reliability.
5. Review token/cost budgets, data retention/consent, human approvals and rollback before authorizing autonomous code writes or model training.

## Verification status

Committing code, unit tests, and HTTP mock-provider integration cases is implementation evidence only. Full production completion requires passing CI, real provider evaluation, and independently reviewed domain performance. Never promote these checkpoints into a claim of an original pre-trained foundation model.
