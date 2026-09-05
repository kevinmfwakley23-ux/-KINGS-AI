# Official K.I.N.G.S. AI branding

## Canonical artwork

The owner-supplied crowned-lion K.I.N.G.S. AI crest is the canonical K.I.N.G.S. AI visual identity. It must not be redesigned, replaced with a generic crown/lion, recolored, or silently substituted.

The application-tracked web/native derivative is:

`native-shell/kings-ai-official-logo.png`

Tracked repository derivative SHA-256:

`46575e83e6e5e68c77ce3523017817dd32ef954397554f618768b91c17939026`

Decoded RGBA pixel SHA-256:

`593606dedc7e2e4ec47d492633959122fb74e3e59c7fd91546bfef13f81ad8ae`

The original owner-supplied 1254×1254 PNG source used to create the application derivative had SHA-256:

`5ec47e7e1219add3e66f910239e390facdce280f63805da8e43660c21c71edbc`

The tracked derivative is an application-sized optimization of that source artwork, not a redesign. Brand integrity is locked at two levels: the tracked PNG byte fingerprint and the decoded pixel fingerprint. The pixel lock prevents a different image from being accepted merely because metadata or compression changes; an intentional artwork change requires an explicit brand update.

## Required surfaces

The canonical artwork is the source for:

- the K.I.N.G.S. native gateway/splash surface;
- native browser/favicon branding;
- Android launcher icon generation;
- future Windows, Linux, macOS and iOS launcher/bundle icon generation;
- high-visibility K.I.N.G.S. owner UI branding where the owner console is rendered.

Brand integrity is enforced by `development/kings-brand-integrity.mjs`, `development/android-native-package-test.mjs`, and `ui/project-owner/server-brand-test.mjs`.

Any intentional replacement of the official artwork requires an explicit brand update and corresponding integrity-test update.
