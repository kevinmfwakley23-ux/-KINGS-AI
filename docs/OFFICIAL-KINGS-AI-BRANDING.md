# Official K.I.N.G.S. AI branding

## Canonical artwork

The owner-supplied crowned-lion K.I.N.G.S. AI crest is the canonical K.I.N.G.S. AI visual identity. It must not be redesigned, replaced with a generic crown/lion, recolored, or silently substituted.

The application-tracked web/native derivative is:

`native-shell/kings-ai-official-logo.png`

Tracked repository derivative SHA-256:

`120a27fdad36b77eb9f0eae0e0e065c44d93eb57ed0aa3afd94e36d1ef04b1f0`

The original owner-supplied 1254×1254 PNG source used to create the application derivative had SHA-256:

`5ec47e7e1219add3e66f910239e390facdce280f63805da8e43660c21c71edbc`

The tracked derivative is an application-sized optimization of that source artwork, not a redesign.

## Required surfaces

The canonical artwork is the source for:

- the K.I.N.G.S. native gateway/splash surface;
- native browser/favicon branding;
- Android launcher icon generation;
- future Windows, Linux, macOS and iOS launcher/bundle icon generation;
- high-visibility K.I.N.G.S. owner UI branding where the owner console is rendered.

Brand integrity is enforced by `development/android-native-package-test.mjs`, which verifies the tracked PNG identity and verifies that the Android packaging workflow uses it as the Tauri icon source.

Any intentional replacement of the official artwork requires an explicit brand update and corresponding integrity-test update.
