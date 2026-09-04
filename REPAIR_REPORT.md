# K.I.N.G.S. AI Repair Report

## Repaired
- Added a root TypeScript build/test contract (`package.json`, `tsconfig.json`).
- Restored eight missing production modules required by existing imports:
  - mission execution coordinator
  - product build decomposer
  - product build execution gateway
  - product build execution cycle
  - product build worker runner
  - research acquisition source gateway
  - research-backed capability acquisition
  - resource-aware capability acquisition
- Completed the product-build task graph with architecture, research, backend,
  frontend, integration, testing, hardening, and release stages.
- Fixed product mission registration and runnable-task snapshot semantics.
- Made the Project Owner research-policy test date-independent.
- Removed the knowledge retriever's hard-coded `~/kings-collectibles-1` path.
  `KINGS_KNOWLEDGE_EXTRACTED_ROOT` can now override the default location.
- Added knowledge-index schema/error handling.
- Made the Python retrieval test hermetic with temporary fixture indexes.
- Added a repository test runner that distinguishes deterministic tests from
  live external-integration tests.

## Verification performed in the repair environment
- Offline TypeScript full-graph compilation: PASS.
- Deterministic TypeScript tests: 194/194 PASS.
- Python knowledge retrieval tests: PASS.
- Six live integration tests remain environment-dependent:
  - CrewAI executable/runtime
  - real project knowledge index/work-unit setup
  - outbound rust-lang.org research access
  - local Ollama model
  - two live local coding/model loops

These six are intentionally excluded from `npm test` and can be exercised with
`npm run test:live` after their external prerequisites are installed/configured.

## Usage
```bash
npm install
npm test
```

For live integrations:
```bash
npm run test:live
```

For a custom extracted knowledge index:
```bash
KINGS_KNOWLEDGE_EXTRACTED_ROOT=/path/to/indexes/extracted npm run test:knowledge
```
