# Anatomy asset pipeline (Open3Dmodel)

Turns Open3Dmodel `.glb` files into web-ready assets for the viewer at `/anatomy/<region>`.

## Source

[Open3Dmodel](https://anatomytool.org/open3dmodel-create) from AnatomyTOOL — retopologised,
textured and anatomically reviewed. A far better starting point than raw Z-Anatomy or
BodyParts3D, which render as flat grey meshes with visible surface artefacts.

Downloads (not committed; archives hosted by caskanatomy.info):

```
BASE=https://caskanatomy.info/open3dmodelfiles
curl -O $BASE/overview-skeleton/overview-skeleton-glb.zip           # 3.0 MB — whole-body skeleton
curl -O $BASE/overview-colored-skull/overview-colored-skull-glb.zip
curl -O $BASE/colored-skull-base/colored-skull-base-glb.zip
curl -O $BASE/exploded-view-skull/exploded-view-skull-glb.zip
curl -O $BASE/vertebrae/vertebrae-glb.zip
curl -O $BASE/upper-limb/upper-limb-glb.zip                         # 5.9 MB
curl -O $BASE/lower-limb/lower-limb-glb.zip                         # 5.2 MB
curl -O $BASE/hand/hand-glb.zip                                     # 2.7 MB
```

**There is no full-body model.** Open3Dmodel publishes by region; `overview-skeleton` is the
only whole-body asset and it is bones only. A full body with organs and soft tissue does not
exist in this source.

## Building

```
npm --prefix scripts install
node scripts/anatomy/prepare-model.mjs \
  --in /path/to/overview-skeleton.glb --region skeleton --label "Skeleton"
```

Outputs `frontend/public/anatomy/<region>.glb` (gitignored) and
`frontend/src/components/anatomy/<region>.json` (committed — small, and the non-WebGL
fallback needs it). Register the region in `frontend/src/components/anatomy/regions.ts`.

`inspect-glb.mjs <file|dir>` reports what any `.glb` contains without modifying it.

## What prepare-model.mjs does, and why

### 1. Decodes the source, then re-compresses on the way out

Every Open3Dmodel `.glb` lists `KHR_draco_mesh_compression` in **`extensionsRequired`**, so it
must be decoded before steps 2–3 can edit the meshes.

It used to be written back out decoded, because the CSP allowed neither `'wasm-unsafe-eval'`
nor the `gstatic.com` origin drei fetches its decoder from. That cost roughly 4× the file
size — **95 MB of raw geometry across the eight regions, against 5 MB of texture** — and
upper-limb alone was 31.2 MB, about two minutes at 2 Mbps. For medical students on Egyptian
mobile connections that is not a usable download, so both blockers are now handled rather
than avoided:

- the decoder is **self-hosted** at `/draco/`, synced from the installed three.js by
  `frontend/scripts/sync-draco-decoder.mjs` (wired to `prebuild`, so it cannot go stale);
- **`'wasm-unsafe-eval'` is scoped to the `/anatomy` routes only** in `next.config.ts`. It
  permits WebAssembly compilation and nothing else — unlike `'unsafe-eval'`, it does not
  permit `eval()` of strings — and every other route, checkout and login included, keeps the
  stricter policy.

The pipeline also halves the triangle count first (`simplify`, error 0.001), since the source
meshes are far denser than a viewer at this scale can display.

| Region | Was (plain) | Now (simplify + Draco) | Saving |
|---|---|---|---|
| Skull | 4.48 MB | **0.98 MB** | −78% |
| Upper limb | 31.19 MB | **4.15 MB** | −87% |

Measured end to end on `/anatomy/skull` with `scripts/anatomy/measure.mjs`, mobile viewport
on Slow 4G with 4× CPU throttling:

| | Before | After |
|---|---|---|
| `.glb` over the wire | 3.60 MB | **0.87 MB** |
| Total page transfer | 4.13 MB | **1.48 MB** |
| Time to first interactive render | 10.90 s | **5.71 s** |
| Peak JS heap | 32 MB | **21 MB** |
| Frame rate while orbiting | 60 median | 60 median |

Escape hatches: `--no-compress` reproduces the old decoder-free output, and `--simplify 1`
keeps every triangle.

### 2. Strips non-commercial textures

The models are CC BY-SA 4.0, but the muscle textures — `Muscle tiles`, `Muscle tiles plain`,
`Muscle long tendons`, `Tendon only` ("Thoracic walls" by Claudia Krebs et al, University of
British Columbia) — are **CC BY-NC-SA 4.0**. NonCommercial is incompatible with a paid
platform, so they are removed and those materials fall back to flat colour.

Affected: **upper limb, lower limb, hand**. Not affected: skeleton, all three skulls,
vertebrae. `--keep-nc` retains them for local evaluation only.

### 3. Mirrors bilateral structures

Open3Dmodel ships bilateral anatomy one-sided to halve the download — the skeleton has 107
nodes suffixed `.r` and none suffixed `.l` — and expects the viewer to mirror them. Without
this you get half a skeleton.

Node transforms in these files are identity with geometry baked in world space and the
sagittal plane at x=0, so a sibling node with scale `[-1,1,1]` is an exact mirror; three.js
flips winding itself when a world matrix has negative determinant, so normals stay correct.
The mirror reuses the same mesh data, so it costs almost nothing: the skeleton grows from
13.30 MB to 13.31 MB while going from 144 to 251 structures.

### 4. Names and classifies

Structures are bucketed into bone / muscle / artery / vein / nerve / ligaments from their own
names, and `.r` / `.l` become `(right)` / `(left)`. Open3Dmodel's naming is good, so nothing
is invented — only tidied.

## Known CSP issue: embedded textures are blocked

three.js loads embedded glTF textures through `blob:` URLs, and our `connect-src` does not
list `blob:`, so **texture loading fails in production** — about 56 console violations per
model load, and affected materials render untextured.

```
connect-src 'self' blob: <existing origins…>
```

`img-src` and `media-src` already include `blob:`; `connect-src` does not. Nothing here has
been changed. Measured visual cost: small. Geometry and lighting carry most of the look, and
the muscle textures are stripped for licensing anyway — a CSP-enforced and a CSP-bypassed
render of the skull are near-identical.

## Measuring

```
cd frontend && npm run build && npx next start -p 3100
node scripts/anatomy/measure.mjs --url http://localhost:3100/anatomy/skeleton
```

Always measure a production build, and run nothing else at the same time — a concurrent
browser job skews every number.

The harness forces GPU-backed ANGLE, because headless Chromium otherwise silently falls back
to SwiftShader software rendering and reports frame rates that say nothing about real
hardware; it prints the renderer so a software run cannot be mistaken for a device result.
Draw calls and triangles are read from the settled scene rather than mid-drag (they do not
change while orbiting, verified) because an instantaneous read during a fast synthetic spin
can catch a frame between render passes. The "mobile" profile throttles CPU 4× and network at
a phone viewport but still draws on the desktop GPU, so treat it as an optimistic bound, not
a prediction.
