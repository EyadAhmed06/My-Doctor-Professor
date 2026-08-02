# Design QA — X layouts in Y visual language

## Evidence

- Source visual truth:
  - `/workspace/scratch/44144b9eb803/upload/landing.png` (1680 × 939)
  - `/workspace/scratch/44144b9eb803/upload/login.png` (1680 × 939)
  - `/workspace/scratch/44144b9eb803/upload/register.png` (1693 × 939)
  - Y palette/style reference: `/workspace/scratch/44144b9eb803/upload/WhatsApp Image 2026-08-02 at 2.52.55 PM(1).jpeg` (1600 × 900)
- Implementation: browser-rendered routes `/`, `/login`, and `/register` in cloud-browser tab 1.
- Browser viewport: 1363 × 936 CSS pixels, device density 1.
- Implementation captures: full-page browser screenshots emitted during the QA run for all three routes.
- State: desktop, dark Y theme, default form state.
- Normalization: the source screenshots are wider than the fixed cloud-browser viewport. Comparisons therefore used the same 939/936 px vertical frame and judged horizontal region proportions responsively rather than claiming a literal equal-pixel overlay.

## Required fidelity surfaces

- Fonts and typography: Georgia display serif reproduces the high-contrast editorial headings; Arial provides the compact UI sans. Heading hierarchy, weights, teal emphasis, form-label optical weight, and wrapping follow X. Login was given a 59/41 split and a 53 px intermediate-desktop heading to preserve the source's two-line composition.
- Spacing and layout rhythm: the hero/form splits, form density, bottom trust strip, pricing-card geometry, register two-column workflow, radii, borders, and vertical rhythm follow X. The 1363 px register overflow and pricing metadata wrapping found in the first pass were corrected with fractional minmax tracks and a non-wrapping price row.
- Colors and visual tokens: X's light surfaces were intentionally replaced with Y's near-black navy, indigo panels, low-contrast borders, cyan/teal states, and blue-to-violet primary gradients.
- Image quality and asset fidelity: the central medical-study scene is a dedicated generated raster asset, embedded losslessly in a repository-safe SVG container. Its monitor, notebook, mug, heart poster, books, and plant match X's subject while line color and glow match Y. No placeholder or CSS-drawn illustration is used.
- Copy and content: headings, supporting copy, benefits, plan names/prices/features, field labels, institution prompts, trust statements, and payment messaging are preserved from the supplied X references.

## Full-view comparison evidence

- Landing: source and browser render were placed in the same comparison call. Main region split, hero hierarchy, benefit stack, signup-card structure, Clinical Pro summary, and bottom security row align. Y styling is the requested intentional deviation.
- Login: source and browser render were placed in the same comparison call. The editorial left hero, three benefits, illustration, trust strip, login-card sequence, Google action, account link, institution row, and security note align.
- Register: source and browser render were placed in the same comparison call. Plan selection, pricing cards, payment benefits, account/student form sections, verification notice, terms, and payment CTA align.

Focused region comparison was not separately required because every important form control and text block remained legible in the 1363 × 936 full-page captures.

## Comparison history

### Iteration 1

- P1: register right panel overflowed the fixed browser viewport.
- P2: quarterly/annual pricing metadata wrapped and the last annual feature approached the CTA.
- P2: login heading wrapped to three lines at the intermediate desktop width, unlike the source.
- Fixes: replaced percentage grid tracks with `minmax(0, 57fr/43fr)`; compacted register form rhythm; made price rows non-wrapping and reduced feature spacing; changed login to a 59/41 split with intermediate-width heading scaling; repositioned the illustration to avoid benefit-copy overlap.

### Iteration 2

- Post-fix evidence: revised browser captures showed the register card fully inside the viewport, compact pricing rows, a two-line login headline, and clear illustration separation.
- A final intermediate-width capture exposed a P2 regression: the narrower login grid caused the card's internal content column and institution row to wrap too aggressively.

### Iteration 3

- Fix: reduced only the login form-side and card horizontal padding between 1101–1500 px, restoring the source's input width and institution-row proportions without changing the wide desktop layout.
- Post-fix evidence: the final 1363 × 936 browser capture showed an unbroken “Welcome back” title, full-width fields and CTA, and readable single-row institution content.
- No actionable P0/P1/P2 visual differences remain. Residual differences are the explicitly requested Y theme and responsive normalization for the narrower QA viewport.

## Interaction and runtime checks

- Routes opened successfully: `/`, `/login`, `/register`.
- Input filling, password visibility control, plan selection controls, and route links were inspected.
- Application console errors filtered to `terminal.local`: none.
- Browser-extension metadata errors were excluded because they originate from the cloud-browser extension, not the application.
- Production build: passed.
- TypeScript: passed through Next production build.
- ESLint: passed with zero warnings after use of Next Image.

## Final result

final result: passed
