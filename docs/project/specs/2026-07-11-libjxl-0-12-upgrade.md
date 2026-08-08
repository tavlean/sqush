# Spec: libjxl v0.8.5 → v0.12.0 (encoder rewrite onto the public C API)

Last updated: 2026-08-08. Status: **landed on `main`** (merge `6135a6fd`),
together with a follow-up the measurement forced: the quality-to-distance curve
was redesigned for v0.12.0's accurate distance targeting and RESAMPLING is
pinned to full resolution. The Outcome section at the end records why criterion
4 was superseded rather than met.
Origin: maintainer decision 2026-07-11. Supersedes the "Path A stops at 0.8.5"
outcome in [codec-upgrade-runbooks.md](../../codec-upgrade-runbooks.md) §jxl —
this IS that runbook's "Path B", now decided. Prerequisite for
[2026-07-11-jpeg-to-jxl-transcode.md](2026-07-11-jpeg-to-jxl-transcode.md).

## Objective

Upgrade `codecs/jxl` from v0.8.5 to **v0.12.0** (released 2026-07-01). This is
the single biggest compression win available to Frisp: upstream reports
lossless images 30–80% smaller with faster decoding, progressive lossless
30–40% smaller, 2–5× faster multithreaded encoding, plus the 0.10-era ~5×
lossless speedup and CVE fixes (0.11.1, 0.11.2) we currently lack. The cost:
the encoder wrapper (`codecs/jxl/enc/jxl_enc.cpp`) must be **rewritten from
libjxl's internal C++ API onto the public `JxlEncoder*` C API** — the internal
headers it uses (`enc_file.h`, `enc_color_management.h`) were deleted in
v0.9.0, which is the entire reason the 2026-06 sweep stopped at 0.8.5. The
**app-facing contract is frozen**: same `JXLOptions` fields, same
`encode(image, width, height, options)` embind signature, same artifact names
— zero changes outside `codecs/jxl/` except regenerated
`src/app-generated/codecs/jxl/**` and version notes in docs.

## Non-goals

- No new options fields, no UI changes (`JxlOptions.svelte` untouched; the
  effort range stays 1–9 even though upstream now allows 10).
- No JPEG→JXL transcode entrypoint (separate spec, builds on this one).
- No decoder feature work — only the minimal edits 0.12 forces.
- No changes to the six-artifact layout (`jxl_enc`, `jxl_enc_mt`,
  `jxl_enc_mt_simd`, `jxl_dec`, `jxl_node_enc`, `jxl_node_dec`).

## Codebase assumptions (re-verify before starting)

- `codecs/jxl/Makefile` pins `CODEC_VERSION = v0.8.5` (line ~7) and documents
  the internal-API reason on lines 2–6.
- `codecs/jxl/enc/jxl_enc.cpp` uses `jxl::CompressParams` + `EncodeFile` +
  `GetJxlCms`; options struct `JXLOptions` has exactly 8 fields:
  `int effort; float quality; bool progressive; int epf; bool lossyPalette;
  size_t decodingSpeedTier; float photonNoiseIso; bool lossyModular;`.
- `codecs/jxl/dec/jxl_dec.cpp` uses the public decoder API plus ONE internal
  header (`lib/jxl/color_encoding_internal.h`) and skcms.
- Build docs: [codec-build-notes.md](../../codec-build-notes.md) (§libjxl gotchas
  1–6 and the `thread_local val::global` bug), toolchain = **emcc 3.1.0
  arm64-native** for jxl, and [codec-upgrade-runbooks.md](../../codec-upgrade-runbooks.md)
  §jxl Path B. Read BOTH before the first build.
- Verify loop: `npm run check` → `npm run test:e2e` → `npm run bench` +
  `npm run bench:compare` (a green build can still ship a broken codec).

## Changes by file

### `codecs/jxl/Makefile`

- `CODEC_VERSION = v0.12.0`. Rewrite the lines-2–6 comment: the internal-API
  constraint is gone; the wrapper now uses the public API.
- Keep the fetch mechanism (git init + depth-1 fetch + recursive submodules),
  the two build dirs (`build/mt`, `build/mt-simd`), the six targets, the
  `-sPTHREAD_POOL_SIZE=navigator.hardwareConcurrency` MT rule, and the CMake
  flag set. Expect drift in: include paths (`lib/include` layout), the
  link-archive list (brotli/skcms/highway names or locations), and new CMake
  options — resolve by inspecting the v0.12.0 tree, not by guessing. jpegli
  was removed from the libjxl tree in 0.12, so any `JPEGXL_ENABLE_JPEGLI`
  handling is obsolete.
- The encoder must now link `libjxl.a` (public API) and — MT variants only —
  `libjxl_threads.a` for `JxlThreadParallelRunner`.

### `codecs/jxl/enc/jxl_enc.cpp` — the rewrite

Keep verbatim: the `JXLOptions` struct, the embind block shape
(`value_object<JXLOptions>` with the same 8 field names,
`function("encode", &encode)`), the `val encode(std::string image, int width,
int height, JXLOptions options)` signature, and **the existing
quality→butteraugli-distance mapping function (current lines ~56–63) — port
it unchanged**; it is product behavior, not an implementation detail.

Replace the internal-API body with the public-API sequence (cross-check
against `examples/encode_oneshot.cc` in the v0.12.0 tree — that file is the
upstream-blessed pattern; where this skeleton and the example disagree,
follow the example and note the deviation in a comment):

```cpp
JxlEncoder* enc = JxlEncoderCreate(nullptr);
// MT builds only (#ifdef the same way the Makefile splits variants):
//   void* runner = JxlThreadParallelRunnerCreate(nullptr, JxlThreadParallelRunnerDefaultNumWorkerThreads());
//   JxlEncoderSetParallelRunner(enc, JxlThreadParallelRunner, runner);

JxlBasicInfo info;
JxlEncoderInitBasicInfo(&info);
info.xsize = width;  info.ysize = height;
info.num_color_channels = 3;  info.num_extra_channels = 1;
info.alpha_bits = 8;  info.bits_per_sample = 8;
info.uses_original_profile = lossless ? JXL_TRUE : JXL_FALSE;
JxlEncoderSetBasicInfo(enc, &info);

JxlColorEncoding color;
JxlColorEncodingSetToSRGB(&color, /*is_gray=*/JXL_FALSE);
JxlEncoderSetColorEncoding(enc, &color);

JxlEncoderFrameSettings* fs = JxlEncoderFrameSettingsCreate(enc, nullptr);
JxlEncoderFrameSettingsSetOption(fs, JXL_ENC_FRAME_SETTING_EFFORT, options.effort);
JxlEncoderFrameSettingsSetOption(fs, JXL_ENC_FRAME_SETTING_DECODING_SPEED, options.decodingSpeedTier);
JxlEncoderFrameSettingsSetOption(fs, JXL_ENC_FRAME_SETTING_EPF, options.epf);
if (lossless) {
  JxlEncoderSetFrameLossless(fs, JXL_TRUE);
} else {
  JxlEncoderSetFrameDistance(fs, distance /* from the ported quality→distance mapping */);
}
// Map the remaining JXLOptions fields via JxlEncoderFrameSettingsSetOption /
// SetFloatOption; mirror how tools/cjxl_main.cc in the v0.12.0 tree maps its
// equivalent flags — do NOT invent mappings:
//   progressive      -> the setting(s) cjxl uses for --progressive
//   lossyModular     -> JXL_ENC_FRAME_SETTING_MODULAR = 1
//   lossyPalette     -> JXL_ENC_FRAME_SETTING_LOSSY_PALETTE = 1 (with modular, as before)
//   photonNoiseIso   -> JXL_ENC_FRAME_SETTING_PHOTON_NOISE (float, ISO value)

JxlPixelFormat fmt = {4, JXL_TYPE_UINT8, JXL_LITTLE_ENDIAN, 0};
JxlEncoderAddImageFrame(fs, &fmt, image.data(), image.size());
JxlEncoderCloseInput(enc);
// JxlEncoderProcessOutput loop growing a std::vector<uint8_t> until JXL_ENC_SUCCESS.
```

"lossless" here = the same condition the old wrapper derived from
`quality == 100` — read the old code and keep the derivation identical.
Return path: build the result `val` by resolving `val::global("Uint8Array")`
**at call time, never at namespace scope** (the costliest bug of the 2026-06
sweep — build-notes §libjxl; a namespace-scope `thread_local val` crashes at
result-marshalling time only, after a successful encode).

Destroy in reverse order on every path (`JxlEncoderDestroy`, runner destroy);
on any `JXL_ENC_ERROR` return `val::null()` (the current wrapper's failure
contract — verify and match it).

### `codecs/jxl/dec/jxl_dec.cpp`

Minimal edits only: (1) the 0.9.0 signature change removed the unused first
argument from `JxlDecoderGetICCProfileSize` / `JxlDecoderGetColorAsICCProfile`
— update the two call sites; (2) if `lib/jxl/color_encoding_internal.h` is
gone or moved in 0.12.0, replace its use with the public
`JxlColorEncoding`-based equivalent rather than chasing the internal header.
Everything else stays.

### Regeneration & docs

- Rebuild all six artifacts; run `npm run sync` (wrapper patching) so
  `src/app-generated/codecs/jxl/**` regenerates. `enc/jxl_enc.d.ts` must end
  up byte-identical in its exported types (same 8 option fields).
- Update: `docs/codec-provenance.md` (pin table v0.8.5 → v0.12.0),
  `codec-build-notes.md` (append new gotchas found),
  `codec-upgrade-runbooks.md` (mark jxl Path B executed),
  `codec-upgrade-audit.md` banner (landed version note).

## Interfaces & data shapes

Frozen: `EncodeOptions` = the 8 `JXLOptions` fields with identical names and
types; `JXLModule.encode(data: BufferSource, width: number, height: number,
options: EncodeOptions) => Uint8Array | null`. Any change to these is a spec
violation, not a judgment call.

## Edge cases

| Input | Required behavior |
|---|---|
| quality 100 (lossless) | `JxlEncoderSetFrameLossless` + `uses_original_profile = JXL_TRUE`; output decodes bit-identical to input pixels. |
| quality < 7 | App layer already forces `lossyModular` — wrapper maps modular mode exactly as before; no wrapper-side re-derivation. |
| effort 9 (UI max) | Passes through unchanged; do not remap to upstream's new 10. |
| Encode failure mid-stream | `val::null()` after full cleanup; no leaked encoder/runner. |
| ST build (`jxl_enc.js`) | No parallel runner call at all (not a 1-thread runner) — mirrors how the Makefile splits variants today. |

## Test plan

- Existing e2e already covers JXL encode (`tests/e2e/codec-encode.spec.ts`:
  magic bytes `0xFF 0x0A` or ISOBMFF container, size non-trivial, zero page
  errors) and the threading specs cover the `_mt` path. No new tests required;
  they must all stay green in BOTH Chromium and WebKit projects.
- Benchmark is the real gate: `npm run bench` then
  `node benchmarks/compare.mjs benchmarks/baseline.json benchmarks/results/current.json`.

## Acceptance criteria

1. `codecs/jxl/Makefile` pins `v0.12.0`; `make` (per
   `codec-provenance.md`'s build command for jxl) produces all six artifacts.
2. `jxl_enc.cpp` contains no `#include "lib/jxl/enc_*"` internal headers and
   no namespace-scope `val::global`.
3. `npm run check` passes; full `npm run test:e2e` passes (Chromium + WebKit),
   including the JXL threading spec.
4. `npm run bench:compare` vs the committed baseline shows JXL output size
   ≤ baseline on every fixture (expected: smaller) and no other codec changed
   at all.
5. Lossless round-trip: encode `tests/fixtures/illustration.png` at
   quality 100, decode, pixels identical (add a one-off e2e assertion or a
   Node check with the `jxl_node_*` artifacts if quicker).
6. `docs/codec-provenance.md` shows v0.12.0; runbook + build-notes updated.

## Verification

```
cd codecs/jxl && npm run build        # or the build-cpp.sh path provenance names
npm run sync && npm run check
npm run test:e2e
npm run bench && npm run bench:compare
```

## Guardrails

- Work in an isolated branch (both upstream anchors failed to cross this
  wall; the runbook's isolate warning stands). Everything else in this repo
  merges to `main` directly — this is the standing exception.
- Do NOT touch any other codec directory, `encode-signature.ts`, encoder
  metas, or UI.
- Do NOT "improve" the quality→distance mapping or default options while
  in there — byte-level output changes must come only from the library bump.
- If the v0.12.0 WASM build is genuinely stuck after a focused effort
  (~half a day), STOP, record the exact failure in `codec-build-notes.md`,
  and fall back to targeting v0.11.2 with the same wrapper rewrite (the
  rewrite is the durable asset; the version becomes a one-line bump later).

## Anticipated mistakes

1. **Porting the wrapper by imitating the old internal-API code** instead of
   the public-API example. The old body is dead; only its option *mappings*
   and quality math survive. Criterion 2 catches header leakage.
2. **Namespace-scope `thread_local val::global`** — compiles fine, encodes
   fine, crashes returning the result on emcc 3.1.0. Grep the new file.
3. **Forgetting `JxlEncoderCloseInput`** — the ProcessOutput loop then never
   returns `JXL_ENC_SUCCESS` and the encode hangs; e2e times out.
4. **Setting the parallel runner in the ST build** — WebKit/no-SAB fallback
   breaks; the threading e2e catches it, but check the `#ifdef` split first.
5. **Letting `uses_original_profile` default (false) in lossless mode** —
   lossless becomes not-quite-lossless; criterion 5 catches it.
6. **Rebuilding only `build/mt` and shipping a stale `mt-simd`** — the six
   artifacts have two source builds; `ls -la` timestamps before committing.
7. **Skipping `npm run sync`** — app imports the *patched* wrappers under
   `src/app-generated/`; stale copies mean the app silently runs 0.8.5.

## If things break

- **Encode hangs in `_mt` in the browser:** pthread pool — confirm
  `-sPTHREAD_POOL_SIZE=navigator.hardwareConcurrency` survived the Makefile
  edit (build-notes: on-demand pthread spawning deadlocks `Atomics.wait`).
- **`TypeError ... (reading 'value')` after a successful-looking encode:**
  anticipated mistake 2.
- **Duplicate skcms symbols at link:** the decoder needed
  `-DJPEGXL_BUNDLE_SKCMS=0` in 2026-06; the flag may need to move/change at
  0.12 — see build-notes gotcha 5.
- **CMake refuses old brotli:** `-DCMAKE_POLICY_VERSION_MINIMUM=3.5`
  (gotcha 3). **`llvm-ar` missing:** add `emsdk/upstream/bin` to PATH
  (gotcha 4). **Submodule targets missing:** wipe the checkout dir, re-fetch
  (gotcha 2).
- **Bench shows a size REGRESSION on some fixture:** don't ship — first check
  the progressive/modular option mappings against `cjxl_main.cc`; a wrong
  `JXL_ENC_FRAME_SETTING_*` constant is the usual cause.

---

**TLDR:** Bump `codecs/jxl` to v0.12.0; rewrite `jxl_enc.cpp` onto the public
`JxlEncoder*` API (skeleton above; port the existing quality→distance math
verbatim; map remaining options per `cjxl_main.cc`); two minimal decoder
edits; app contract and artifact set frozen; gate on e2e + bench-compare.
Work in an isolated branch — this is the one codec both upstreams failed to
upgrade.

Spec: `docs/project/specs/2026-07-11-libjxl-0-12-upgrade.md`

## Outcome (2026-08-08)

Executed on branch `codec/libjxl-0-12` (commit 97968d6c). Check, unit, and
full e2e pass in both browsers including the threading spec; lossless
round-trip is pixel-identical; every non-JXL codec is byte-identical against
a HEAD control run (the committed `benchmarks/baseline.json` is stale for
WebP and AVIF sizes; see docs/gotchas.md).

Criterion 4 fails because libjxl 0.10 to 0.12 made distance targeting
accurate: at the same slider position the encoder now actually reaches the
requested butteraugli distance, so lossy output is higher fidelity and 3 to
70 percent larger (illustration at quality 75: 4915 bytes at 41.88 dB on
v0.8.5, 6401 bytes at 43.11 dB on v0.12.0). The wrapper was verified faithful
against natively built cjxl from the same checkout (within 3 bytes). The
guardrail "do not retune the quality mapping" and criterion 4 "size must not
grow" cannot both hold; per the guardrail the mapping was left untouched.

The decision (2026-08-08, maintainer delegated the mapping design): a
matched-size measurement showed v0.12.0 ties v0.8.5 on photographs and needs
18 to 30 percent more bytes on flat and text content at equal SSIMULACRA2. It
also exposed that libjxl's silent 2x-downsampling threshold moved from
distance 20 to 10, which the ported curve crossed at slider 13, and that the
old curve's bottom scored negative SSIMULACRA2 even on v0.8.5. The shipped
resolution: RESAMPLING pinned to 1 and a new curve calibrated to delivered
fidelity (100 lossless; 30 to 100 linear to distance 0.1 + (100 - q) / 10;
below 30 linear to 15 at q0). Default 75 reproduces the old default's photo
behavior within 0.4 percent, and every slider position is now full-resolution
and monotone. Artifact growth (roughly 1 MB per encoder artifact) was
investigated to the end: no CMake flag reduces it, -Os would save 392 KB at
about 20 percent encode time and was rejected, so the growth is accepted.
The benchmark baseline was re-captured at the merge commit with the new JXL
sizes.

Handoff:
`codex exec -C /Users/tav/Development/Tavlean/Frisp -s workspace-write -m gpt-5.6-sol -c model_reasoning_effort="medium" "Implement docs/project/specs/2026-07-11-libjxl-0-12-upgrade.md exactly. Read docs/codec-build-notes.md and docs/codec-upgrade-runbooks.md (jxl section) first. Follow the guardrails. Do not commit or push. Report PASS or FAIL against each acceptance criterion."`
(medium effort: this one carries real build ambiguity; every other codec spec
runs at low.)
