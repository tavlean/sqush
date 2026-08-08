# New-Codec Investigation

Last updated: 2026-08-09. Status: **investigation record. SVGO and jpegli have
SHIPPED; JPEG→JXL transcode superseded → build; HEIC still open.**

This doc records a research pass on four candidate new codecs/processors that
came out of the codec audit ([the codec upgrade audit](project/reports/2026-06-02-codec-upgrade-audit.md)
§4–5). Two of the four are now in the app: **SVGO** (the vector lane, stages
S1–S6, with only its S8 benchmark open) and **jpegli** (a second JPEG encoder).
The remaining entries are decision material, not a plan to execute: each says
what it would add, whether a usable browser/WASM build exists, the effort, and a
recommendation. The WASM build toolchain is installed and proven, so a codec
recompile is no longer a blocker on any of them.

## TL;DR

| Candidate | What it adds | Recommendation |
|-----------|--------------|----------------|
| **SVGO v4** (SVG/vector optimizer) | Optimizes SVG/vector files the raster pipeline can't touch | **SHIPPED.** The vector lane is live (stages S1–S6); only the S8 benchmark remains. Pure JS, official browser bundle, no WASM/toolchain. |
| **libheif decode-only HEIC input** | Opens iPhone `.heic` (browsers can't decode it), convert out | **LATER.** Strong, but defer for LGPL + WASM weight; do SVGO first. |
| **jpegli WASM encoder** | Better quality-per-byte standard `.jpg` than MozJPEG | **SHIPPED 2026-08-09.** Live as "JPEG (jpegli)" beside MozJPEG; `codecs/jpegli/`. |
| **Lossless JPEG→JXL transcode** | Recompress `.jpg` to `.jxl` ~20% smaller, reversible | **SUPERSEDED 2026-07-11 → BUILD** (after the jxl 0.12 upgrade): [specs/2026-07-11-jpeg-to-jxl-transcode.md](project/specs/2026-07-11-jpeg-to-jxl-transcode.md) |

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

## 4. Lossless JPEG→JXL transcoding — **SKIP**

> **SUPERSEDED 2026-07-11.** The recompile blocker is gone (toolchain installed;
> the encoder rewrite is specced anyway) and JXL browser reach flipped (Safari
> ships it; Chrome 145 ships the decoder behind a flag, default-on expected H2
> 2026). Decided → build after the jxl upgrade:
> [specs/2026-07-11-jpeg-to-jxl-transcode.md](project/specs/2026-07-11-jpeg-to-jxl-transcode.md).
> The analysis below is kept as the historical record.

- **What it adds:** Recompresses a `.jpg` into a `.jxl` ~20% smaller,
  **bit-for-bit reversible** (the `cjxl` default behavior for JPEG input).
- **WASM feasibility:** Not possible with the current code. True transcoding
  needs the JPEG DCT bitstream path (`JxlEncoderAddJPEGFrame`), but Frisp's
  `jxl_enc.cpp` takes **pixels** and `jxl_dec.cpp` outputs **pixels**. jSquash's
  `lossless: true` is a pixel re-encode, not a transcode, so it does not give the
  reversible ~20% either.
- **Effort:** High. New C++ plus a libjxl recompile — impossible here (no emcc).
- **Maturity:** The libjxl transcode path is mature upstream, but it is **not
  surfaced** in Frisp or in jSquash.
- **Recommendation:** SKIP; it is recompile-gated and JXL browser reach is weak
  (~12% of browsers).
- **Sources:**
  - <https://github.com/jamsinclair/jSquash/issues/93>
  - <https://github.com/jamsinclair/jSquash/pull/94>
  - <https://en.wikipedia.org/wiki/JPEG_XL>

---

## Related

- [the codec upgrade audit](project/reports/2026-06-02-codec-upgrade-audit.md) — the audit that raised these
  candidates (§4–5).
- [codec-upgrade-runbooks.md](codec-upgrade-runbooks.md) — turnkey upgrade steps
  for the *existing* codecs (a separate, executable track).
- [roadmap.md](project/roadmap.md) — product direction.
