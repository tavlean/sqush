# New-Codec Investigation

Last updated: 2026-08-11. Status: **investigation record. SVGO, jpegli and the
JPEG→JXL transcode have SHIPPED; HEIC is the one still open.**

This doc records a research pass on four candidate new codecs/processors that
came out of the codec audit ([the codec upgrade audit](project/reports/2026-06-02-codec-upgrade-audit.md)
§4–5). Three of the four are now in the app: **SVGO** (the vector lane, stages
S1–S6, with only its S8 benchmark open), **jpegli** (a second JPEG encoder), and
the **lossless JPEG→JXL transcode**. HEIC is the remaining entry, and it is
decision material rather than a plan to execute: it says what it would add,
whether a usable browser/WASM build exists, the effort, and a recommendation.
The WASM build toolchain is installed and proven, so a codec recompile is no
longer a blocker on it.

## TL;DR

| Candidate | What it adds | Recommendation |
|-----------|--------------|----------------|
| **SVGO v4** (SVG/vector optimizer) | Optimizes SVG/vector files the raster pipeline can't touch | **SHIPPED.** The vector lane is live (stages S1–S6); only the S8 benchmark remains. Pure JS, official browser bundle, no WASM/toolchain. |
| **libheif decode-only HEIC input** | Opens iPhone `.heic` (browsers can't decode it), convert out | **LATER.** Strong, but defer for LGPL + WASM weight; do SVGO first. |
| **jpegli WASM encoder** | Better quality-per-byte standard `.jpg` than MozJPEG | **SHIPPED 2026-08-09.** Live as "JPEG (jpegli)" beside MozJPEG; `codecs/jpegli/`. |
| **Lossless JPEG→JXL transcode** | Repack `.jpg` as `.jxl`, smaller and exactly reversible | **SHIPPED 2026-08-11.** The "Lossless transcode" toggle in the JXL panel, for JPEG sources with no pixel edits. |

**SVGO shipped first.** It was the only candidate that added a format the app
could not handle before, and it needed no codec toolchain. The vector lane is
now live (stages S1–S6); the S8 benchmark is the only open piece.

---

## 1. SVGO v4 — SVG / vector optimization — **SHIPPED**

> **SHIPPED 2026-07-12.** A four-agent research pass (nano published-technique
> analysis, optimizer landscape, techniques, integration audit; public sources
> only) produced a phased approach targeting parity with ImageOptim and
> match-or-beat vs vecta nano:
> [svg-optimization-analysis.md](svg-optimization-analysis.md). That approach
> was approved and BUILT. The vector lane is live in the editor (stages S1–S6:
> `svgo` runtime dep, the `src/lib/svg/` worker pipeline plus auto-search, the
> `SvgOptions.svelte` options panel, and `'svg'` as an editor output format);
> only the S8 benchmark remains open. The entry below is the original short
> verdict.

- **What it adds:** Optimizes SVG/vector files, which the raster codec pipeline
  cannot touch at all. Complements the existing codecs rather than competing with
  them — it is the only candidate that adds a *format the app cannot handle
  today*.
- **WASM feasibility:** Best of the four. **Pure JS, no WASM**, with an official
  browser bundle (`import svgo/browser`), Worker-friendly. v4.0.0 shipped June
  2025 (current 4.0.1).
- **Effort:** Low-to-moderate, all TS/Svelte — no codec build. ~780 KB lazy
  bundle. Work is: add SVG detection, an "optimize" processor, and a small UI.
  Note v4 disables `removeViewBox` and `removeTitle` by default (behavior change
  from v3 to be aware of when porting any preset).
- **Maturity:** Mature and active; v4.0.0 June 2025, official browser bundle.
- **Sources:**
  - <https://github.com/svg/svgo/releases/tag/v4.0.0>
  - <https://svgo.dev/docs/usage/>
  - <https://www.npmjs.com/package/svgo>

---

## 2. libheif decode-only HEIC input — **LATER**

- **What it adds:** Opens iPhone HEIC files (browsers cannot natively decode
  HEIC) so a user can drop a `.heic` and convert it out to a supported format.
  **Decode only — never encode HEIC.**
- **WASM feasibility:** Strong. The maintained `libheif-js` (catdad, v1.19.8) is
  decode-capable, and the browser variant bundles the `.wasm` inside a single
  `.mjs`. License is **LGPL-3.0** — a deliberate licensing decision, not an
  accident, and the reason to defer.
- **Effort:** Moderate TS/wiring, **no codec build**. Sketch: decoder under
  `src/features/decoders/heif/*`, register the HEIC MIME/extension, add it to
  `src/shared/codec-assets.ts` and the SW precache plan
  (`src/sw/cache-plan.ts`), and lazy-load on a HEIC drop.
- **Maturity:** Mature. Upstream libheif (strukturag) is the de-facto library;
  `libheif-js` is active (v1.19.x).
- **Recommendation:** LATER. The candidate is strong, but defer for the LGPL
  license, the WASM weight, and the added surface. Do SVGO first.
- **Sources:**
  - <https://github.com/catdad-experiments/libheif-js>
  - <https://www.npmjs.com/package/libheif-js>
  - <https://github.com/strukturag/libheif>

---

## 3. jpegli WASM encoder: **SHIPPED 2026-08-09**

jpegli is in the app as **JPEG (jpegli)**, a second JPEG encoder beside MozJPEG.
It is a single-variant encode-only WASM codec at `codecs/jpegli/`, built from a
pinned `google/jpegli` commit with emsdk 3.1.0, exposing three options (quality,
progressive, chroma subsampling) because its tuned defaults are the point of the
codec. Build knowledge is in
[codec-build-notes.md](codec-build-notes.md) §jpegli; the pin and licence are in
[codec-provenance.md](codec-provenance.md).

The 2026-07-11 research verdict was SKIP, and both of its reasons expired rather
than being wrong at the time. It said no browser build existed, which was true of
third-party packaging and irrelevant once we built our own; and it said emcc was
not installed, which the 2026-06 codec sweep settled. The one thing worth
carrying forward is that the third-party ports it surveyed
(`apenchev/jpegli`, `gen2brain/jpegli`) are still not what you want: building
from upstream took one clean pass.

**MozJPEG stays the default JPEG.** Which of the two encoders should own the
`JPEG` menu entry is a product decision waiting on benchmark evidence, and the
first datapoint is in the worklog entry for this change.

---

## 4. Lossless JPEG→JXL transcoding: **SHIPPED 2026-08-11**

Load a JPEG, pick JPEG XL, and the panel offers **Lossless transcode**: libjxl
repacks the source's existing DCT coefficients instead of re-encoding pixels, and
stores the record that rebuilds the original `.jpg` byte for byte. Verified end
to end: `djxl` reconstruction of the app's own output `cmp`s identical to
`tests/fixtures/photo.jpg`. It is single-image only; bulk has no transcode lane
yet.

This is the one candidate in this doc that changed the pipeline's *shape* rather
than its settings. Everything else routes decoded pixels through
decode → preprocess → resize → encode; the transcode needs the file bytes, so it
gets its own wasm entrypoint (`transcodeJPEG` beside `encode`), its own worker
op, and a branch in `encodeSide` guarded on the source being a JPEG with nothing
touching its pixels. The `jpegTranscode` flag lives in the JXL options object so
it reaches the encode signature, which is what keeps transcode and pixel results
from colliding in the result cache.

The 2026-07-11 verdict was SKIP, and it was right about the mechanism and wrong
about the constraints. It correctly identified that a real transcode needs
`JxlEncoderAddJPEGFrame` and that jSquash's `lossless: true` is a pixel
re-encode giving none of the benefit. What it treated as permanent were two
things that expired: "impossible here (no emcc)", settled by the 2026-06 codec
sweep, and weak browser reach, which flipped when Safari shipped JXL and Chrome
145 shipped the decoder behind a flag. Worth carrying forward: reach was never
the deciding argument anyway. A reversible archive format does not need the
open web to display it, because the point is getting the original back.

**Measured saving is size-dependent.** 19.9% on the 4000×3000 fixture, 12.2% on
the 1024×683 one. The ~20% headline describes camera-sized photos; quoting it
for thumbnails will read as a regression. Build knowledge is in
[codec-build-notes.md](codec-build-notes.md) §libjxl gotchas 20–26.

---

## Related

- [the codec upgrade audit](project/reports/2026-06-02-codec-upgrade-audit.md) — the audit that raised these
  candidates (§4–5).
- [codec-upgrade-runbooks.md](codec-upgrade-runbooks.md) — turnkey upgrade steps
  for the *existing* codecs (a separate, executable track).
- [roadmap.md](project/roadmap.md) — product direction.
