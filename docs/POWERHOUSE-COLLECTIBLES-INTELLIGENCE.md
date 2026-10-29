# K.I.N.G.S. AI POWERHOUSE — Collectibles Intelligence Office

## Ownership

**This is an internal office in K.I.N.G.S. AI POWERHOUSE, located in this repository**. It is not a standalone app, simulator, or code migration to Collector's Kingdom. Its page runs at /collectibles on the authenticated owner console.

The office reuses the existing K.I.N.G.S. Brain Core model routing and OwnerMissionExecutionService router, including OmniRoute / 9Router. Shared routing primitives may be reused independently by Collector's Kingdom later, but Collector's Kingdom is not required to be online for POWERHOUSE's office.

## Actual workflow

1. Owner authenticates to existing POWERHOUSE console.
2. Owner selects Pokémon/TCG, sports card, comic, antique, or miscellaneous collectible.
3. Owner uploads 1–4 JPEG/PNG/WebP photographs (maximum 4 MiB each) and explicitly authorizes analysis.
4. K.I.N.G.S. invokes a configured vision-capable model through the existing governed provider router. A missing vision provider causes a failure, not an invented grade.
5. The model produces candidate observations tied to numbered photographs; server validates the shape, item identity, bounded grade ranges, and explanations.
6. POWERHOUSE stores a condition report with evidence SHA-256 hashes and model attribution in its private .kings directory. Raw original image bytes are not retained by the report store.
7. Owner can inspect report history, open individual reports, and print the findings.

## Operator configuration

Configure the existing OmniRoute and/or 9Router base URLs and model lists using the usual environment settings. Add only models that really support images to:

- KINGS_OMNIROUTE_VISION_MODELS
- KINGS_9ROUTER_VISION_MODELS
- KINGS_COLLECTIBLES_REPORT_STORE (optional, defaults to .kings/collectibles-reports.json)

Do not commit API keys. Model provider selection and credentials remain server-owned.

## Trust boundaries and limitations

- Remote assessment endpoints are authenticated by the existing owner console. Use trusted HTTPS termination for remote access.
- Photos are transmitted to the selected model provider and processed according to that provider's data policies.
- User notes are untrusted context; they are not instructions to the AI provider.
- Photographs alone cannot confirm authenticity, restoration, proven provenance, or market value.
- Comic and card grade ranges are illustrative and non-certified; antiques and miscellaneous collectibles are described without a universal numeric grade.
- Professional in-hand grading is recommended before business claims or marketplace certification.
- Assessment history retains observation text and image hashes, not source image files. The owner must separately retain originals for future proof.

## Tests and verification

After checking out the feature branch, run these from the repository root:

    npm ci
    npm run build
    node --test ui/project-owner/collectibles-office-test.mjs
    node ui/project-owner/server-collectibles-test.mjs
    npm run verify

The integration test operates a local fake OpenAI-compatible endpoint solely to verify image bytes, routing, authentication, persistence and provenance. It does NOT demonstrate accuracy on actual cards/comics/antiques and must not be presented as a professional grading benchmark.

Production acceptance still requires a real configured vision model, a representative real item photograph dataset, expert comparison, false-positive auditing, calibration, provider privacy review, and deployment proof.
