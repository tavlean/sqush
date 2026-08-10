# Spec: Lossless JPEG → JXL transcode

Last updated: 2026-08-11. Status: **landed on `main`** (commit 70c306a0,
2026-08-11). All 6 acceptance criteria met; reversibility proven by a djxl
reconstruction byte-identical to the source (matching sha256). Measured:
photo.jpg 84947 to 74604 bytes (12.2 percent; the advertised ~20 percent
appears at camera size, 19.9 percent on the 12 MP fixture). Notable accepted
deviations: the encoder runtime factory returns both entrypoints rather than
instantiating a second module, `preprocessingIsNeutral` also excludes film
grain, and the registry id follows the file's kebab-case convention
(`jxl.jpeg-transcode`).
Origin: maintainer decision 2026-07-11. Supersedes the "SKIP" verdict in
[new-codec-investigation.md](../../new-codec-investigation.md) §4 — its blockers
are gone: the recompile toolchain exists (2026-06 sweep), the public-API
encoder rewrite is now specced anyway, and JXL browser reach flipped (Safari
ships it; Chrome 145 ships the decoder behind a flag, default-on expected
H2 2026).

## Objective

When the source file is a JPEG and the output format is JPEG XL, offer a
**"Lossless transcode"** toggle that repacks the JPEG's existing DCT
coefficients into a JXL container via `JxlEncoderAddJPEGFrame` — typically
~20% smaller, **bit-for-bit reversible** back to the original JPEG (the
stored JPEG metadata makes `djxl --reconstruct_jpeg` exact). This is not a
re-encode: zero generation loss, no quality decision to make. It needs raw
JPEG *file bytes*, not decoded pixels, so it gets its own worker op and a
routing branch in the editor — the one feature in this batch that touches the
pipeline's shape rather than just its settings.

## Non-goals

- No JXL→JPEG reconstruction UI (export is one-way in the app; reversibility
  is a property we advertise, verified in tests).
- No transcode for bulk mode in v1 (single-image editor only; bulk follows in
  a later phase once this is proven).
- No transcode when any pixel-changing step is active — resize, quantize, or
  rotate invalidate coefficient reuse by definition; we disable, never
  silently re-encode while the toggle claims lossless.
- No changes to the wrapper's pixel `encode()` path or the `JXLOptions`
  struct (frozen by the upgrade spec).

## Codebase assumptions (re-verify before starting)

- The libjxl 0.12.0 upgrade has landed: `codecs/jxl/enc/jxl_enc.cpp` is on
  the public `JxlEncoder*` API. **If it hasn't, stop — this spec cannot start.**
- `src/worker/codec-worker.ts` + `src/lib/sveltekit-worker-bridge.ts` follow
  the op-registration pattern in the jpegli spec's touch-list.
- `EditorSession.encodeSide` (src/lib/editor/editor-session.svelte.ts, ~line
  281) builds requests from `optionsByFormat`; `compressPreprocessed` lives
  in `src/lib/compress.ts` (~157); the decoded-source cache provides
  `sourceImageData` for the compare view.
- `src/features/encoders/jxl/shared/meta.ts` defaultOptions has 8 fields;
  `JxlOptions.svelte` seeds local state from `options` and writes back via
  `apply()`.
- WS-G per-codec control registries exist (`tests/unit/controls.test.ts`).

## Changes by file

### `codecs/jxl/enc/jxl_enc.cpp` — one new entrypoint

Add alongside `encode` (embind: `function("transcodeJPEG", &transcodeJPEG)`):

```cpp
// Repacks a complete JPEG file's DCT coefficients into a JXL container,
// storing the JPEG metadata needed for exact reconstruction. Returns the
// JXL bytes, or null if this JPEG can't be transcoded (exotic coding —
// caller falls back to pixel encoding).
val transcodeJPEG(std::string jpeg_bytes) {
  JxlEncoder* enc = JxlEncoderCreate(nullptr);
  // MT variants: same parallel-runner setup/#ifdef as encode().
  JxlEncoderFrameSettings* fs = JxlEncoderFrameSettingsCreate(enc, nullptr);
  if (JxlEncoderStoreJPEGMetadata(enc, JXL_TRUE) != JXL_ENC_SUCCESS ||
      JxlEncoderAddJPEGFrame(fs, reinterpret_cast<const uint8_t*>(jpeg_bytes.data()),
                             jpeg_bytes.size()) != JXL_ENC_SUCCESS) {
    JxlEncoderDestroy(enc);
    return val::null();
  }
  JxlEncoderCloseInput(enc);
  // Same JxlEncoderProcessOutput loop + call-time val::global return as encode().
}
```

Note `AddJPEGFrame` replaces `SetBasicInfo`/`SetColorEncoding`/frame options —
the JPEG supplies everything. Do not set distance/effort/lossless on `fs`.
Cross-check the exact call order against the v0.12.0 tree's usage of
`JxlEncoderAddJPEGFrame` (cjxl's JPEG-input path) — upstream order wins.
Update `enc/jxl_enc.d.ts`: `transcodeJPEG(data: BufferSource) => Uint8Array | null`.

### Worker + bridge

- `src/worker/codec-worker.ts`: op `jxlTranscode(jpeg: ArrayBuffer):
  Promise<ArrayBuffer | null>` — loads the same jxl encoder module (same
  variant selection as `jxlEncode`), calls `transcodeJPEG`, returns via
  transfer; `null` (not throw) when the wrapper returns null.
- `src/lib/sveltekit-worker-bridge.ts`: `jxlTranscode` in `methodNames` +
  interfaces + method.

### `src/features/encoders/jxl/shared/meta.ts`

`EncodeOptions` becomes the generated wasm options type **plus**
`jpegTranscode: boolean`; `defaultOptions.jpegTranscode = false`. This field
is app-level routing state that legitimately lives in the options object: it
is output-affecting, so it must flow through `encode-signature` (it does
automatically — options are fingerprinted wholesale) and settings
persistence (additive field on a `Record<string, unknown>` — safe with the
frozen `app:settings:v3`; confirm `settings.test.ts` still passes).

### `src/lib/compress.ts`

New exported `transcodeJpegToJxl(file: File, prepared: PreparedSource,
signal: AbortSignal, bridge: SvelteKitWorkerBridge): Promise<CompressOutcome>`
(match the real `PreparedSource`/outcome types in the file): reads
`await file.arrayBuffer()`, calls `bridge.jxlTranscode`, throws a distinctive
`TranscodeUnsupportedError` on `null`, otherwise builds the same
`CompressOutcome` shape `compressPreprocessed` returns — `outputFile`
(`<name>.jxl`, `image/jxl`), `outputSize`, `outputImageData` obtained by
running the result through the existing JXL *decode* path (same call the
normal pipeline uses to preview an encode), and `sourceImageData` from
`prepared`.

### `src/lib/editor/editor-session.svelte.ts`

In `encodeSide`'s pass, before the normal `compressPreprocessed` call:

```
const wantsTranscode = side.format === 'jxl'
  && options.jpegTranscode === true
  && this.file?.type === 'image/jpeg'
  && preprocessingIsNeutral;   // no rotate, no resize, no quantize — use the
                               // existing neutrality checks the signature
                               // recipe already distinguishes; do not invent new ones
```

If `wantsTranscode`: call `transcodeJpegToJxl`; on
`TranscodeUnsupportedError`, snackbar
`Couldn't transcode this JPEG losslessly — encoded normally instead.` and
fall through to the normal pixel encode **with `jpegTranscode` still true in
the signature** (deterministic: the same input always takes the same path).
If the flag is true but preconditions fail (non-JPEG source, active resize),
the normal path runs — the UI prevents this state, but the engine must not
crash on it. Everything else (cache, dedup, abort, showResult) is unchanged —
transcode results are cached under their signature like any outcome.

### UI — `src/lib/editor/options/JxlOptions.svelte` (+ OptionsPanel prop)

- OptionsPanel passes a `sourceType: string` (the loaded file's MIME) prop
  down to the JXL panel — thread it from wherever OptionsPanel already
  receives side/session context; add the smallest prop that works.
- When `sourceType === 'image/jpeg'`: show a **Lossless transcode** toggle
  (top of the panel, above Lossless) with helper text
  `Repack this JPEG's data into JXL — ~20% smaller, exactly reversible.`
- Toggle ON → hide all other JXL controls (quality/effort/advanced are
  meaningless) and, if resize or quantize is active, show the toggle
  disabled with helper text `Turn off resize/palette reduction to transcode
  losslessly.` (read those states via the same context OptionsPanel uses —
  if unavailable, lift the disabled-check to OptionsPanel and pass a
  `transcodeBlocked: boolean` prop; pick whichever needs fewer new wires).
- Non-JPEG source: toggle not rendered at all.

### Control registry

Add `jxl.jpegTranscode` to the jxl control registry (WS-G) with
compare/apply/reset semantics identical to a boolean toggle field — pattern:
whatever `webp.lossless` does in `tests/unit/controls.test.ts`.

## Interfaces & data shapes

- Wrapper: `transcodeJPEG(data: BufferSource) => Uint8Array | null`.
- Worker op: `jxlTranscode(jpeg: ArrayBuffer) => Promise<ArrayBuffer | null>`.
- `EncodeOptions` (jxl): +`jpegTranscode: boolean`, default `false`.
- Error type: `TranscodeUnsupportedError extends Error` exported from
  `src/lib/compress.ts`.

## Edge cases

| Input | Required behavior |
|---|---|
| Progressive JPEG source | Transcodes (supported upstream); no special handling. |
| Arithmetic-coded / exotic JPEG | Wrapper returns null → snackbar + pixel-encode fallback (same session, no user re-click). |
| JXL output larger than the source JPEG (tiny files) | Allowed; the size readout already shows it. No guard in v1. |
| User enables transcode, then turns on resize | Options unchanged, but preconditions now fail → next encode takes the normal path; UI shows the disabled-with-reason state. |
| Undo/redo across the toggle | Works for free — the flag lives in the options object the history already snapshots. Verify once manually. |
| Source is JPEG but was pasted (no filename) | Output name falls back exactly like normal JXL encodes (same naming helper). |

## Test plan

- **e2e (`tests/e2e/jxl-transcode.spec.ts`, new):** load
  `tests/fixtures/photo.jpg`, select JPEG XL, enable the transcode toggle,
  wait for result; assert JXL signature bytes, output size < source size,
  zero page errors. Second scenario: enable resize first → toggle disabled.
- **Unit:** control-registry round-trip for `jxl.jpegTranscode`; a
  `compress.ts` unit for the outcome-shape mapping if a stubbable seam exists
  (skip if it would need heavy mocking — e2e is the real gate).
- **Reversibility (one-off verification, not CI):** transcode
  `photo.jpg` in the app, then locally
  `djxl --reconstruct_jpeg out.jxl back.jpg && cmp photo.jpg back.jpg`
  (djxl from Homebrew `jpeg-xl`). Record the result in the WORKLOG.

## Acceptance criteria

1. With `photo.jpg` + JXL + transcode ON: output is valid JXL and smaller
   than the source JPEG (both asserted in e2e).
2. Transcode OFF is byte-identical to pre-change JXL encodes at the same
   settings (bench:compare shows no jxl movement — the flag default must not
   alter signatures' *outputs*; note: signatures themselves change because
   options gained a field, so expect a one-time result-cache invalidation,
   which is fine).
3. Resize/quantize active → e2e asserts the toggle is disabled.
4. Exotic-JPEG fallback path exists (unit-test the `null` branch of
   `transcodeJpegToJxl` with a stubbed bridge, or e2e with a crafted fixture
   if one is easy — a stub is acceptable).
5. `npm run check`, unit, full e2e pass; `manual` reversibility check
   recorded in WORKLOG.
6. No changes to other codecs, `encode-signature.ts`, or `result-cache.ts`.

## Verification

```
npm run check && npm run test:unit && npm run test:e2e
npm run bench && npm run bench:compare
# reversibility (local, once):
brew list jpeg-xl >/dev/null 2>&1 || brew install jpeg-xl
djxl --reconstruct_jpeg <app-output>.jxl back.jpg && cmp tests/fixtures/photo.jpg back.jpg
```

## Guardrails

- BLOCKED until the 0.12.0 upgrade merges — never build this against 0.8.5
  (the internal API has no equivalent path; any attempt is wasted work).
- Do NOT auto-enable the toggle for JPEG sources in v1 (a good later default,
  but it changes output format semantics silently — maintainer call).
- Do NOT reuse the pixel `encode()` entrypoint with a flag — separate
  entrypoint, separate worker op (input shapes differ).
- Do NOT add a keep-smaller guard or size warnings in v1.

## Anticipated mistakes

1. **Decoding the JPEG and calling `encode()` with `lossless` options** —
   that's a pixel re-encode, NOT a transcode (jSquash's `lossless: true`
   makes exactly this error; ~0% of the benefit). The wrapper must call
   `JxlEncoderAddJPEGFrame` on the file bytes.
2. **Setting frame options (distance/effort) on the transcode settings** —
   can degrade or break coefficient reuse; the spec's wrapper sets none.
3. **Forgetting `JxlEncoderStoreJPEGMetadata`** — output still decodes but
   reconstruction is lossy → the `cmp` verification fails. Run it.
4. **Routing on the UI state instead of the options field** — the signature
   then can't distinguish transcode results from pixel results and the cache
   serves the wrong bytes. The flag must live in options (spec fixes this).
5. **Passing the File's ArrayBuffer via transfer and reusing it after** —
   detached buffer on retry/fallback; slice or re-read on the fallback path.
6. **Blocking on `this.file.type` alone for "is JPEG"** — pasted/renamed
   files can lie; acceptable in v1 (wrapper null-fallback catches liars), but
   don't ALSO sniff magic bytes app-side — one source of truth, the wrapper.

## If things break

- **`AddJPEGFrame` always returns error:** wrong call order vs upstream —
  recheck against the v0.12.0 cjxl JPEG-input path; also confirm the bytes
  are the raw file (not a decoded buffer).
- **Reconstruction `cmp` fails:** mistake 3, or metadata-keep settings —
  check `JXL_ENC_FRAME_SETTING_JPEG_KEEP_EXIF/XMP` defaults in the pinned
  tree.
- **Preview pane blank after transcode:** the outcome's `outputImageData`
  decode step was skipped — the compare view needs decoded pixels like every
  other result.
- **Cache serves a pixel-encode when transcode is on (or vice versa):**
  mistake 4 — the flag isn't reaching the options object/signature.

---

**TLDR:** New `transcodeJPEG` entrypoint in the (post-0.12) jxl wrapper via
`JxlEncoderAddJPEGFrame` + stored reconstruction metadata; new `jxlTranscode`
worker op; `jpegTranscode: boolean` on the jxl options (flows through
signature/cache/history for free); routing branch in `encodeSide` requiring
JPEG source + neutral preprocessing, with snackbar fallback to pixel encode;
toggle UI in the JXL panel that hides irrelevant controls. Verified by e2e +
a one-off `djxl --reconstruct_jpeg`/`cmp` round-trip.

Spec: `docs/project/specs/2026-07-11-jpeg-to-jxl-transcode.md`

Handoff (after the 0.12 upgrade lands):
`codex exec -C /Users/tav/Development/Tavlean/Frisp -s workspace-write -m gpt-5.6-sol -c model_reasoning_effort="low" "Implement docs/project/specs/2026-07-11-jpeg-to-jxl-transcode.md exactly. Verify its BLOCKED-on prerequisite first; stop if unmet. Follow the guardrails. Do not commit or push. Report PASS or FAIL against each acceptance criterion."`
