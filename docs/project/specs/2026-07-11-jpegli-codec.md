# Spec: jpegli encoder — new codec

Last updated: 2026-08-09. Status: **in execution since 2026-08-09** (build
agent in an isolated worktree; unblocked by the libjxl v0.12.0 landing on
2026-08-08).
Origin: maintainer decision 2026-07-11. Supersedes the "SKIP now" verdict in
[new-codec-investigation.md](../../new-codec-investigation.md) §3 — both of that
verdict's blockers are gone: the emsdk toolchain has been installed and proven
by the 2026-06 sweep (all 7 codecs built natively), and jpegli now lives as a
standalone project at <https://github.com/google/jpegli> (extracted from
libjxl in libjxl v0.12.0). Independent of the libjxl upgrade spec — do not
couple the builds.

## Objective

Add **jpegli** as a new encode-only WASM codec. jpegli produces **standard
JPEG** files every decoder on earth reads, at roughly 30% better
quality-per-byte than libjpeg-turbo at high quality (Google CID22 study) with
encode speed on par with MozJPEG. It is API-compatible with libjpeg62, which
makes `codecs/mozjpeg/` the near-exact template for both the build and the
wrapper. Ships as a fifth output format ("JPEG (jpegli)") beside MozJPEG;
deciding whether it eventually *replaces* MozJPEG as the default JPEG is a
later product decision driven by benchmark results, not this spec.

## Non-goals

- No MozJPEG removal, demotion, or default-format change.
- No XYB colorspace mode (breaks compatibility expectations; jpegli's
  libjpeg-compat path defaults to YCbCr — keep it).
- No decoder (browsers decode JPEG natively; the existing decode path stands).
- No `_mt`/SIMD variants — single-variant, exactly like mozjpeg.
- No bulk-mode control registry work beyond what the touch-list requires to
  keep `npm run check` green.

## Codebase assumptions (re-verify before starting)

- `codecs/mozjpeg/` is the template: CMake-only Makefile (curl-tarball fetch,
  `emcmake cmake … && make jpeg-static`, the `-DSIZE_T=4` type-size pre-seed
  for emsdk 3.1.0's broken `-flto` probe), wrapper
  `enc/mozjpeg_enc.cpp` with `val encode(std::string image_in, int width,
  int height, MozJpegOptions opts)` on the public libjpeg API, artifacts
  `enc/mozjpeg_enc.{js,wasm,d.ts}`.
- Toolchain: emcc 3.1.0 arm64-native for complex C++ codecs
  ([codec-build-notes.md](../../codec-build-notes.md) — read §mozjpeg and the
  `thread_local val::global` bug before building).
- The full add-a-codec touch-list below was verified against the tree on
  2026-07-11; `git log` any file that has moved.
- `npm run sync` = `node scripts/patch-codec-wrappers.mjs` (there is no
  `sync-sveltekit-app.mjs` on main).

## Part 1 — `codecs/jpegli/`

**Source:** `https://github.com/google/jpegli` — no release tags exist; pin
the current `main` HEAD SHA at execution time via the git-fetch pattern from
`codecs/jxl/Makefile` (git init + `git fetch <url> <SHA> --depth 1` +
recursive submodules), and record that exact SHA in the Makefile header and
`docs/codec-provenance.md`. License BSD-3-Clause (record it).

**Makefile:** model on `codecs/mozjpeg/Makefile` (single variant, encode
only, `ENVIRONMENT=web,worker`, `EXPORT_ES6=1`, `--bind`, the standard
`-O3 -flto` env from build-notes). Differences from the template:

- Build the jpegli static library with `emcmake cmake` — discover the actual
  target name in the pinned tree (expected `jpegli-static`; check
  `lib/CMakeLists.txt` / top-level targets, don't guess). Disable everything
  optional: tests, tools, fuzzers (`-DBUILD_TESTING=0` plus whatever
  tool/example switches the tree exposes).
- jpegli vendors/needs **highway**; link `libhwy.a` from the same build.
  There is no rdswitch.o equivalent (that was a mozjpeg cjpeg-helper quirk).
- Output: `OUT_JS := enc/jpegli_enc.js` (+ optional `enc/jpegli_node_enc.js`
  mirroring mozjpeg's node artifact — include it; the benchmarks/tests may
  use it later).

**Wrapper `codecs/jpegli/enc/jpegli_enc.cpp`:** start from a copy of
`mozjpeg_enc.cpp` and cut it down. jpegli's libjpeg-compatible API means the
compress skeleton (`jpeg_create_compress`, `jpeg_mem_dest`,
`jpeg_set_defaults`, `jpeg_set_quality`, `jpeg_start_compress`,
`jpeg_write_scanlines`, `jpeg_finish_compress`) carries over — but include
jpegli's own headers per the pinned tree's public API (check how `cjpegli`'s
compression path includes/initializes; mirror that, including any
jpegli-specific init call if one exists).

Options struct — deliberately minimal (jpegli's whole point is that its
defaults are excellent):

```cpp
struct JpegliOptions {
  int quality;          // 0–100, passed to jpeg_set_quality(..., TRUE)
  bool progressive;     // true -> jpeg_simple_progression(&cinfo)
  int chromaSubsample;  // 0 = encoder default, 1 = force 4:4:4, 2 = force 4:2:0
};
```

Defaults (in the app meta, below): `quality: 75, progressive: true,
chromaSubsample: 0`. `chromaSubsample` maps to `comp_info[i].h_samp_factor /
v_samp_factor` exactly the way mozjpeg's wrapper handles its subsampling
field — copy that mechanism. Input is RGBA8 (`std::string image_in`); strip
alpha to RGB rows exactly as the mozjpeg wrapper does.

**Hard rule:** resolve `val::global("Uint8Array")` **at call time** — do NOT
copy mozjpeg's namespace-scope `thread_local` line (~line 59); that pattern
is the known emcc 3.1.0 crash documented in build-notes §libjxl. Return
`val::null()` on failure. embind: `value_object<JpegliOptions>` (3 fields) +
`function("version", …)` + `function("encode", &encode)` with signature
`val encode(std::string image_in, int image_width, int image_height,
JpegliOptions opts)`.

Ship `enc/jpegli_enc.d.ts` mirroring `mozjpeg_enc.d.ts`: exported
`EncodeOptions` (3 fields) + module `encode(data, width, height, options) =>
Uint8Array | null`.

## Part 2 — app wiring (the add-a-codec touch-list)

Every file below follows the existing mozJPEG entry as the pattern; "add"
means "add one entry shaped like mozJPEG's". Verified locations 2026-07-11:

| File | Change |
|---|---|
| `scripts/patch-codec-wrappers.mjs` | jpegli path consts (pattern: mozjpeg ~lines 149–166), a `generatePatchedJpegliEncoderWrapperShim()` (pattern ~405–417), driver-array entry (~480–560) → emits `src/app-generated/codecs/jpegli/enc/`. |
| `src/features/encoders/jpegli/shared/meta.ts` | `label: 'JPEG (jpegli)'`, `mimeType: 'image/jpeg'`, `extension: 'jpg'`, `defaultOptions: { quality: 75, progressive: true, chromaSubsample: 0 }`, re-export `EncodeOptions` from the generated binding. |
| `src/features/encoders/jpegli/worker/runtime.ts` | `createJpegliEncoderRuntime({ loadEncoder })` — copy mozJPEG's. |
| `src/features/encoders/jpegli/client/runtime.ts` | `encode(signal, workerBridge, imageData, options)` → `workerBridge.jpegliEncode(...)`. |
| `src/client/lazy-app/feature-meta/shared.ts` | Add to `EncoderState` union (~11–17), `EncoderOptions` union (~19–25), `encoderMap` (~27–34). |
| `src/client/lazy-app/feature-meta/encoders.ts` | Import client runtime; add to `encoderMap` (~12–19). |
| `src/worker/codec-worker.ts` | Import runtime + patched module (~20–25); `JpegliWasmUrls`; `locateCodecWasm` path map (~125–145); `jpegliEncode` in `workerApi` (~304–311). |
| `src/lib/sveltekit-worker-bridge.ts` | `methodNames` (~28–42), both API interfaces, `jpegliWasmUrls` const (~213–215), `jpegliEncode` method. |
| `src/shared/codec-assets.ts` | `'jpegli'` in `CodecAssetCodec` union (~6–16). |
| `src/shared/codec-assets/jpegli.ts` (new) | `?url` imports + `jpegliCodecAssetUrls`. |
| `src/shared/codec-assets/manifest.ts` | Import + `assetUrlEntries` (~39–65). |
| `src/shared/codec-assets/service-worker.ts` | Import + `serviceWorkerAssetUrlEntries` (~33–55). |
| `src/shared/codec-asset-records.json` | `{"logicalKey":"jpegli:encoder:default","codec":"jpegli","role":"encoder","variant":"default","path":"codecs/jpegli/enc/jpegli_enc.wasm","cache":"precache"}` — match the mozjpeg record's exact field set. |
| `src/lib/codec-assets.ts` | Import/re-export the URL module (~29–40, 55–87). |
| `src/sw/cache-plan.ts` | Ensure `jpegli:encoder:default` is precached for every variant profile (single-variant — pattern: mozjpeg, ~44–52). |
| `src/lib/editor/options/JpegliOptions.svelte` (new) | Quality slider (0–100), Progressive toggle, Chroma subsampling select (Auto/4:4:4/4:2:0) — model on `MozjpegOptions.svelte`, same seed-from-options + `apply()` pattern. |
| `src/lib/editor/OptionsPanel.svelte` | Import + `{:else if format === 'jpegli'}` branch (~209–220) + type import (~31–35). |
| `src/lib/compress.ts` | `OUTPUT_FORMATS` entry (~44–90): `{ id: 'jpegli', label: 'JPEG (jpegli)', tooltip: <one line: same JPEG format, ~30% better compression>, ext: encoderMap.jpegli.meta.extension }`. |
| `tests/e2e/codec-encode.spec.ts` | `FORMATS` entry with JPEG magic bytes (`0xFF 0xD8 0xFF`). |
| `benchmarks/codec-bench.bench.spec.ts` | Add a jpegli entry at default settings (gives the mozjpeg-vs-jpegli numbers the product decision needs). |
| Enumerators to check (add entries only if `npm run check`/tests demand): `src/client/lazy-app/bulk/controls/index.ts`, `src/client/lazy-app/image-pipeline.ts`, `src/lib/bulk/GlobalOptionsPanel.svelte`, `src/lib/lab/*` inspectors, `tests/unit/{fixtures.ts,controls.test.ts,settings.test.ts}`. |

## Edge cases

| Input | Required behavior |
|---|---|
| Transparent PNG source | Alpha stripped against white? NO — match exactly what mozJPEG's wrapper does with alpha today (same compositing/strip behavior), so the two JPEG encoders are comparable. |
| quality 0 / 100 | Valid encodes; no clamping surprises (jpeg_set_quality handles both). |
| Grayscale source | Arrives as RGBA like everything else; encode as YCbCr JPEG normally (no gray fast-path in v1). |
| `chromaSubsample: 0` | Do not set samp factors at all — jpegli's default is part of its quality story. |

## Test plan

- e2e `codec-encode.spec.ts` gains the jpegli format row (encode `photo.jpg`,
  magic bytes, non-trivial size, zero page errors) — Chromium + WebKit.
- Bench entry runs in `npm run bench`; `bench:compare` must show all
  *existing* codecs unchanged (jpegli is a new row, not a regression).
- Unit: only what the enumerator files force (e.g. controls fixtures).

## Acceptance criteria

1. `codecs/jpegli/` builds from a recorded SHA; artifacts committed;
   provenance table updated with SHA + BSD-3-Clause + build command.
2. `jpegli_enc.cpp` contains no namespace-scope `val::global`.
3. The format picker shows "JPEG (jpegli)"; selecting it on
   `tests/fixtures/photo.jpg` produces a downloadable `.jpg` starting
   `FF D8 FF` that opens (decodes via the browser's native decoder in the
   result pane — the e2e output-decode assertion covers this).
4. `npm run check`, `npm run test:unit`, full `npm run test:e2e` pass.
5. `npm run bench` includes a jpegli row; `bench:compare` shows zero change
   for all pre-existing codecs.
6. MozJPEG's behavior, meta, and defaults are byte-identical to before.
7. SW precache includes the jpegli wasm exactly once (check
   `src/shared/codec-asset-records.json` + cache-plan selection).

## Verification

```
cd codecs/jpegli && npm run build     # match the build command style provenance records
npm run sync && npm run check
npm run test:unit && npm run test:e2e
npm run bench && npm run bench:compare
```

Manual: encode `photo.jpg` at quality 75 with both MozJPEG and jpegli;
eyeball side-by-side at 2×; record both sizes in the WORKLOG entry (first
real datapoint for the future default-JPEG decision).

## Guardrails

- Do NOT modify `codecs/mozjpeg/` or any other codec directory.
- Do NOT change `app:settings:v3` semantics; a brand-new format id is
  additive and safe — verify a stored-settings load from before the change
  still works (settings unit tests).
- If the jpegli CMake tree fights emsdk for more than ~half a day, STOP and
  record findings in `codec-build-notes.md`; do not vendor patches into the
  source checkout beyond flag overrides.
- The tooltip/label wording above is final — don't market it as a new format
  (it's JPEG).

## Anticipated mistakes

1. **Copying mozjpeg's `thread_local val::global` line** — criterion 2; the
   crash appears only at result-return time on large modules.
2. **Building from libjxl's tree** because older docs say jpegli lives there
   — it was removed in libjxl 0.12.0; google/jpegli is the only source.
3. **Setting sampling factors when `chromaSubsample: 0`** — silently degrades
   jpegli's tuned defaults; edge-case table forbids it.
4. **Forgetting the SW/service-worker asset entries** — app works online,
   breaks offline; the offline e2e (`offline.spec.ts`) is the catch, run it.
5. **Adding jpegli to the threaded precache variants** — it has one variant;
   the record's `variant: "default"` must be the only one.
6. **Diverging alpha handling from mozJPEG** — makes the two JPEG encoders
   incomparable; edge-case table pins it.

## If things break

- **Link errors about hwy symbols:** highway not built/linked from the pinned
  tree — check its submodule status and the CMake target list.
- **`-flto` type-size probe failure at configure:** apply the mozjpeg
  Makefile's `-DSIZE_T=4 -DHAVE_SIZE_T=1 -DUNSIGNED_LONG=4
  -DHAVE_UNSIGNED_LONG=1` pre-seed (build-notes §mozjpeg).
- **Output decodes but looks wrong (channel swap/garbage):** RGBA→RGB row
  packing — diff your loop against mozjpeg_enc.cpp's.
- **`Cannot read properties of undefined (reading 'value')`:** mistake 1.
- **Offline reload 404s the wasm:** mistake 4 — asset records/cache-plan.

---

**TLDR:** New single-variant encode-only codec `codecs/jpegli/` built from a
pinned google/jpegli SHA with a mozjpeg-templated CMake Makefile and a cut
down libjpeg-API wrapper (3 options: quality/progressive/chromaSubsample),
wired through the standard 20-file add-a-codec touch-list as "JPEG (jpegli)",
gated on e2e + bench with zero movement in existing codecs.

Spec: `docs/project/specs/2026-07-11-jpegli-codec.md`

Handoff:
`codex exec -C /Users/tav/Development/Tavlean/Frisp -s workspace-write -m gpt-5.6-sol -c model_reasoning_effort="low" "Implement docs/project/specs/2026-07-11-jpegli-codec.md exactly. Read docs/codec-build-notes.md first. Follow the guardrails. Do not commit or push. Report PASS or FAIL against each acceptance criterion."`
