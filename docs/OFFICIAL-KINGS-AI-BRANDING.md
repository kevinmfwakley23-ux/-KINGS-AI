# Official K.I.N.G.S. AI branding

## Canonical artwork

The owner-supplied crowned-lion K.I.N.G.S. AI crest is the canonical K.I.N.G.S. AI visual identity. It must not be redesigned, replaced with a generic crown/lion, recolored, or silently substituted.

The canonical owner source was the supplied 1254×1254 PNG with SHA-256:

`5ec47e7e1219add3e66f910239e390facdce280f63805da8e43660c21c71edbc`

The application-sized 256×256 derivative is reconstructed deterministically at build time as:

`native-shell/kings-ai-official-logo.png`

Materialized derivative SHA-256:

`120a27fdad36b77eb9f0eae0e0e065c44d93eb57ed0aa3afd94e36d1ef04b1f0`

Decoded RGBA pixel SHA-256:

`593606dedc7e2e4ec47d492633959122fb74e3e59c7fd91546bfef13f81ad8ae`

The verified derivative is stored in repository-safe text form as eight ordered base64 source chunks under `native-shell/brand-source/`. `development/materialize-official-brand.mjs` reconstructs the PNG before every normal build and refuses to continue unless the decoded file length, PNG dimensions, and SHA-256 match the locked derivative. The generated PNG is ignored by Git so connector or line-ending transformations cannot silently corrupt the binary again.

This derivative is an application-sized optimization of the owner-approved artwork, not a redesign. `development/kings-brand-integrity.mjs` additionally parses the generated PNG and verifies the decoded RGBA pixel fingerprint. An intentional artwork replacement therefore requires an explicit brand update to both the materializer and integrity contract.

## Required surfaces

The canonical artwork is the source for:

- the K.I.N.G.S. owner-console high-visibility header and favicon;
- the K.I.N.G.S. native gateway/splash surface;
- Android launcher icon generation;
- future Windows, Linux, macOS and iOS launcher/bundle icon generation.

Brand integrity is enforced by `development/materialize-official-brand.mjs`, `development/kings-brand-integrity.mjs`, `development/android-native-package-test.mjs`, and `ui/project-owner/server-brand-test.mjs`.

Any intentional replacement of the official artwork requires explicit owner approval plus a corresponding integrity-contract update.
