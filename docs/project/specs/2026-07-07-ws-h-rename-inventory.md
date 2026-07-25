# WS-H Rename Inventory (appendix to 2026-07-07-first-principles-execution.md)

Produced 2026-07-07 by an automated read-only sweep before WS-A1 and WS-C landed.
Known deltas after those landed: (1) WS-A1 deleted the 12 orphaned
worker wrapper files (avifDecode.ts, jxlDecode.ts, qoiDecode.ts, webpDecode.ts,
avifEncode.ts, jxlEncode.ts, mozjpegEncode.ts, oxipngEncode.ts, qoiEncode.ts,
webpEncode.ts, quantize.ts, resize.ts) — drop them from the git-mv list;
(2) WS-C deleted `the retired generator script`, so its reference block below
vanished; §5 already covers both states. Re-run the §5 verification rg
before starting. Occurrence counts are advisory; the sed patterns are the spec.

**1. Complete `git mv` List**

```text
src/client/lazy-app/abort.ts → src/engine/abort.ts
src/client/lazy-app/bulk/changes.ts → src/engine/bulk/changes.ts
src/client/lazy-app/bulk/detail.ts → src/engine/bulk/detail.ts
src/client/lazy-app/bulk/export.ts → src/engine/bulk/export.ts
src/client/lazy-app/bulk/import.ts → src/engine/bulk/import.ts
src/client/lazy-app/bulk/index.ts → src/engine/bulk/index.ts
src/client/lazy-app/bulk/processor.ts → src/engine/bulk/processor.ts
src/client/lazy-app/bulk/queue.ts → src/engine/bulk/queue.ts
src/client/lazy-app/bulk/runner.ts → src/engine/bulk/runner.ts
src/client/lazy-app/bulk/session.ts → src/engine/bulk/session.ts
src/client/lazy-app/bulk/settings.ts → src/engine/bulk/settings.ts
src/client/lazy-app/bulk/size.ts → src/engine/bulk/size.ts
src/client/lazy-app/bulk/snapshot.ts → src/engine/bulk/snapshot.ts
src/client/lazy-app/bulk/strip.ts → src/engine/bulk/strip.ts
src/client/lazy-app/bulk/summary.ts → src/engine/bulk/summary.ts
src/client/lazy-app/bulk/urls.ts → src/engine/bulk/urls.ts
src/client/lazy-app/image-decode.ts → src/engine/image-decode.ts
src/client/lazy-app/image-pipeline-shared.ts → src/engine/image-pipeline-shared.ts
src/client/lazy-app/image-pipeline.ts → src/engine/image-pipeline.ts
src/client/lazy-app/output-filename.ts → src/engine/output-filename.ts
src/client/lazy-app/sw-bridge/runtime.ts → src/engine/sw-bridge/runtime.ts
src/client/lazy-app/util/canvas.ts → src/engine/util/canvas.ts
src/client/lazy-app/util/index.ts → src/engine/util/index.ts
src/client/lazy-app/util/svg.ts → src/engine/util/svg.ts
src/client/lazy-app/worker-bridge/runtime.ts → src/engine/worker-bridge/runtime.ts

src/features/README.md → src/engine/features/README.md
src/features/decoders/avif/worker/avifDecode.ts → src/engine/features/decoders/avif/worker/avifDecode.ts
src/features/decoders/avif/worker/runtime.ts → src/engine/features/decoders/avif/worker/runtime.ts
src/features/decoders/jxl/worker/jxlDecode.ts → src/engine/features/decoders/jxl/worker/jxlDecode.ts
src/features/decoders/jxl/worker/runtime.ts → src/engine/features/decoders/jxl/worker/runtime.ts
src/features/decoders/qoi/worker/qoiDecode.ts → src/engine/features/decoders/qoi/worker/qoiDecode.ts
src/features/decoders/qoi/worker/runtime.ts → src/engine/features/decoders/qoi/worker/runtime.ts
src/features/decoders/webp/worker/runtime.ts → src/engine/features/decoders/webp/worker/runtime.ts
src/features/decoders/webp/worker/webpDecode.ts → src/engine/features/decoders/webp/worker/webpDecode.ts
src/features/encoders/avif/client/runtime.ts → src/engine/features/encoders/avif/client/runtime.ts
src/features/encoders/avif/shared/meta.ts → src/engine/features/encoders/avif/shared/meta.ts
src/features/encoders/avif/worker/avifEncode.ts → src/engine/features/encoders/avif/worker/avifEncode.ts
src/features/encoders/avif/worker/runtime.ts → src/engine/features/encoders/avif/worker/runtime.ts
src/features/encoders/jxl/client/runtime.ts → src/engine/features/encoders/jxl/client/runtime.ts
src/features/encoders/jxl/shared/meta.ts → src/engine/features/encoders/jxl/shared/meta.ts
src/features/encoders/jxl/worker/jxlEncode.ts → src/engine/features/encoders/jxl/worker/jxlEncode.ts
src/features/encoders/jxl/worker/runtime.ts → src/engine/features/encoders/jxl/worker/runtime.ts
src/features/encoders/mozJPEG/client/runtime.ts → src/engine/features/encoders/mozJPEG/client/runtime.ts
src/features/encoders/mozJPEG/shared/meta.ts → src/engine/features/encoders/mozJPEG/shared/meta.ts
src/features/encoders/mozJPEG/worker/mozjpegEncode.ts → src/engine/features/encoders/mozJPEG/worker/mozjpegEncode.ts
src/features/encoders/mozJPEG/worker/runtime.ts → src/engine/features/encoders/mozJPEG/worker/runtime.ts
src/features/encoders/oxiPNG/client/runtime.ts → src/engine/features/encoders/oxiPNG/client/runtime.ts
src/features/encoders/oxiPNG/shared/meta.ts → src/engine/features/encoders/oxiPNG/shared/meta.ts
src/features/encoders/oxiPNG/worker/oxipngEncode.ts → src/engine/features/encoders/oxiPNG/worker/oxipngEncode.ts
src/features/encoders/oxiPNG/worker/runtime.ts → src/engine/features/encoders/oxiPNG/worker/runtime.ts
src/features/encoders/qoi/client/runtime.ts → src/engine/features/encoders/qoi/client/runtime.ts
src/features/encoders/qoi/shared/meta.ts → src/engine/features/encoders/qoi/shared/meta.ts
src/features/encoders/qoi/worker/qoiEncode.ts → src/engine/features/encoders/qoi/worker/qoiEncode.ts
src/features/encoders/qoi/worker/runtime.ts → src/engine/features/encoders/qoi/worker/runtime.ts
src/features/encoders/webP/client/runtime.ts → src/engine/features/encoders/webP/client/runtime.ts
src/features/encoders/webP/shared/meta.ts → src/engine/features/encoders/webP/shared/meta.ts
src/features/encoders/webP/worker/runtime.ts → src/engine/features/encoders/webP/worker/runtime.ts
src/features/encoders/webP/worker/webpEncode.ts → src/engine/features/encoders/webP/worker/webpEncode.ts
src/features/preprocessors/rotate/shared/meta.ts → src/engine/features/preprocessors/rotate/shared/meta.ts
src/features/preprocessors/rotate/worker/runtime.ts → src/engine/features/preprocessors/rotate/worker/runtime.ts
src/features/processors/quantize/shared/meta.ts → src/engine/features/processors/quantize/shared/meta.ts
src/features/processors/quantize/worker/quantize.ts → src/engine/features/processors/quantize/worker/quantize.ts
src/features/processors/quantize/worker/runtime.ts → src/engine/features/processors/quantize/worker/runtime.ts
src/features/processors/resize/client/preset-state.ts → src/engine/features/processors/resize/client/preset-state.ts
src/features/processors/resize/client/runtime.ts → src/engine/features/processors/resize/client/runtime.ts
src/features/processors/resize/shared/meta.ts → src/engine/features/processors/resize/shared/meta.ts
src/features/processors/resize/shared/util.ts → src/engine/features/processors/resize/shared/util.ts
src/features/processors/resize/worker/resize.ts → src/engine/features/processors/resize/worker/resize.ts
src/features/processors/resize/worker/runtime.ts → src/engine/features/processors/resize/worker/runtime.ts
src/features/worker-utils/index.ts → src/engine/features/worker-utils/index.ts

src/worker-shared/supports-wasm-threads.ts → src/shared/worker/supports-wasm-threads.ts
```

**2. Alias Definition Sites**

Current sites found:

- `vite.config.ts:116-145`
- `svelte.config.js:7-20`
- generated `.svelte-kit/tsconfig.json:3-54`, produced from SvelteKit aliases
- root `tsconfig.json:16-23` has includes only, no alias paths, but currently includes `.svelte-kit/app-generated/**/*.ts`

Post-WS-C / WS-H target:

```ts
// vite.config.ts
alias: {
  'app-generated': fileURLToPath(new URL('./.svelte-kit/app-generated', import.meta.url)),
  codecs: fileURLToPath(new URL('./codecs', import.meta.url)),
  engine: fileURLToPath(new URL('./src/engine', import.meta.url)),
  shared: fileURLToPath(new URL('./src/shared', import.meta.url)),
  sw: fileURLToPath(new URL('./src/sw', import.meta.url)),
}
```

```js
// svelte.config.js
alias: {
  'app-generated': './.svelte-kit/app-generated',
  codecs: './codecs',
  engine: './src/engine',
  shared: './src/shared',
  sw: './src/sw',
}
```

Remove these aliases entirely:

```text
client/lazy-app/feature-meta/shared
client/lazy-app/feature-meta/encoders
client/lazy-app/feature-meta
client
features
worker-shared
```

`tsconfig.json`:

- If POST-WS-C: keep `.svelte-kit/app-generated/**/*.ts` only if patched codec wrappers still live there and are imported directly.
- If WS-C has fully shrunk app-generated to wrappers only, no `client/features/worker-shared` tsconfig alias work should remain.
- Run `npm run sync` or `svelte-kit sync`; `.svelte-kit/tsconfig.json` should regenerate with only `engine`, `shared`, `app-generated`, `codecs`, `sw`, `$lib`, `$app/*`.

**3. Import Specifier Rewrites**

Current import-specifier counts from `src tests scripts`:

- `client/lazy-app/...`: 50 occurrences, 19 unique specifiers
- `features/...`: 76 occurrences, 39 unique specifiers
- `worker-shared/...`: 4 occurrences, 1 unique specifier

POST-WS-C delta: the old generated import strings are gone. Expected live counts are about 50 `features/...` occurrences and 3 `worker-shared/...` occurrences before the rename.

Mechanical rewrites:

```sh
# source imports
perl -pi -e "s#(['\"])client/lazy-app/#\${1}engine/#g" $(rg -l "['\"]client/lazy-app/" src tests scripts --glob '*.{ts,js,svelte,mjs}')
perl -pi -e "s#(['\"])features/#\${1}engine/features/#g" $(rg -l "['\"]features/" src tests scripts --glob '*.{ts,js,svelte,mjs}')
perl -pi -e "s#(['\"])worker-shared/#\${1}shared/worker/#g" $(rg -l "['\"]worker-shared/" src tests scripts --glob '*.{ts,js,svelte,mjs}')
```

Unique specifiers:

```text
client/lazy-app/abort
client/lazy-app/bulk
client/lazy-app/bulk/import
client/lazy-app/bulk/processor
client/lazy-app/bulk/queue
client/lazy-app/bulk/session
client/lazy-app/bulk/settings
client/lazy-app/bulk/size
client/lazy-app/bulk/summary
client/lazy-app/feature-meta
client/lazy-app/feature-meta/encoders
client/lazy-app/feature-meta/shared
client/lazy-app/image-decode
client/lazy-app/image-pipeline
client/lazy-app/image-pipeline-shared
client/lazy-app/sw-bridge/runtime
client/lazy-app/util
client/lazy-app/util/canvas
client/lazy-app/worker-bridge/runtime

features/decoders/avif/worker/avifDecode
features/decoders/avif/worker/runtime
features/decoders/jxl/worker/jxlDecode
features/decoders/jxl/worker/runtime
features/decoders/qoi/worker/qoiDecode
features/decoders/qoi/worker/runtime
features/decoders/webp/worker/runtime
features/decoders/webp/worker/webpDecode
features/encoders/${name}/client/runtime
features/encoders/avif/shared/meta
features/encoders/avif/worker/avifEncode
features/encoders/avif/worker/runtime
features/encoders/jxl/shared/meta
features/encoders/jxl/worker/jxlEncode
features/encoders/jxl/worker/runtime
features/encoders/mozJPEG/shared/meta
features/encoders/mozJPEG/worker/mozjpegEncode
features/encoders/mozJPEG/worker/runtime
features/encoders/oxiPNG/shared/meta
features/encoders/oxiPNG/worker/oxipngEncode
features/encoders/oxiPNG/worker/runtime
features/encoders/qoi/shared/meta
features/encoders/qoi/worker/qoiEncode
features/encoders/qoi/worker/runtime
features/encoders/webP/shared/meta
features/encoders/webP/worker/runtime
features/encoders/webP/worker/webpEncode
features/preprocessors/rotate/shared/meta
features/preprocessors/rotate/worker/runtime
features/processors/quantize/shared/meta
features/processors/quantize/worker/quantize
features/processors/quantize/worker/runtime
features/processors/resize/client/preset-state
features/processors/resize/client/runtime
features/processors/resize/shared/meta
features/processors/resize/worker/resize
features/processors/resize/worker/runtime
features/worker-utils

worker-shared/supports-wasm-threads
```

Non-mechanical flag:

- No live `.ts` / `.svelte` import specifier failed the three prefix patterns.

**4. Non-Code References**

Docs and scripts references found outside live source imports:

```text
docs/history/codec-surface-cleanup.md:28
docs/history/codec-surface-cleanup.md:36
docs/history/codec-surface-cleanup.md:52
docs/history/codec-surface-cleanup.md:59
docs/history/codec-surface-cleanup.md:96
docs/history/codec-surface-cleanup.md:97
docs/review-hardening-plan.md:113
docs/test-plan.md:37
docs/test-plan.md:209
docs/new-codec-investigation.md:60
docs/upstream-signals.md:55
docs/codec-upgrade-runbooks.md:357
docs/svelte-hardening-plan.md:85
docs/svelte-hardening-plan.md:91
docs/svelte-hardening-plan.md:95
docs/svelte-hardening-plan.md:102
docs/svelte-hardening-plan.md:249
docs/project/reports/2026-07-07-first-principles-review.md:12
docs/project/reports/2026-07-07-first-principles-review.md:31
docs/project/reports/2026-07-07-first-principles-review.md:32
docs/project/reports/2026-07-07-first-principles-review.md:45
docs/project/reports/2026-07-07-first-principles-review.md:50
docs/project/reports/2026-07-07-first-principles-review.md:92
docs/project/reports/2026-07-07-first-principles-review.md:123
docs/project/reports/2026-07-07-first-principles-review.md:126
docs/project/reports/2026-07-07-first-principles-review.md:132
docs/project/reports/2026-07-07-first-principles-review.md:146
docs/project/reports/2026-07-07-first-principles-review.md:152
docs/project/reports/2026-07-07-first-principles-review.md:204
docs/project/reports/2026-07-07-first-principles-review.md:207
docs/parity-audit.md:123
docs/overview.md:25
docs/overview.md:27
docs/overview.md:30
docs/rename-record.md:52
docs/user-guide/reference/features.md:34
docs/user-guide/reference/features.md:42
docs/bulk-ui-design-options.md:68
docs/bulk-image-architecture.md:8
docs/bulk-image-architecture.md:168
docs/bulk-image-architecture.md:199
docs/bulk-image-architecture.md:231
docs/bulk-image-architecture.md:286
docs/bulk-image-architecture.md:291
docs/bulk-image-architecture.md:297
docs/bulk-image-architecture.md:302
docs/bulk-image-architecture.md:317
docs/bulk-image-architecture.md:332
docs/bulk-image-architecture.md:333
docs/bulk-image-architecture.md:334
docs/bulk-image-architecture.md:335
docs/bulk-image-architecture.md:342
docs/bulk-image-architecture.md:348
docs/user-guide/reference/engine-and-codecs.md:4
docs/user-guide/reference/engine-and-codecs.md:23
docs/user-guide/reference/engine-and-codecs.md:26
docs/user-guide/reference/engine-and-codecs.md:58
docs/user-guide/reference/engine-and-codecs.md:76
docs/user-guide/reference/engine-and-codecs.md:87
docs/threading-enablement.md:37
docs/threading-enablement.md:39
docs/threading-enablement.md:117
docs/threading-enablement.md:132
docs/codec-provenance.md:84-96
docs/codec-provenance.md:128
docs/user-guide/engine-and-codecs.md:30
docs/user-guide/engine-and-codecs.md:50
docs/project/roadmap.md:57
docs/project/roadmap.md:225
docs/user-guide/reduce-palette.md:57
docs/project/brief.md:57
docs/project/brief.md:306
docs/project/brief.md:309
docs/project/brief.md:455
docs/project/brief.md:456
docs/project/brief.md:457
docs/project/specs/2026-07-07-first-principles-execution.md:31
docs/project/specs/2026-07-07-first-principles-execution.md:37
docs/project/specs/2026-07-07-first-principles-execution.md:44
docs/project/specs/2026-07-07-first-principles-execution.md:45
docs/project/specs/2026-07-07-first-principles-execution.md:142
docs/project/specs/2026-07-07-first-principles-execution.md:266
docs/project/specs/2026-07-07-first-principles-execution.md:282
docs/project/specs/2026-07-07-first-principles-execution.md:283
docs/project/specs/2026-07-07-first-principles-execution.md:285
docs/project/specs/2026-07-02-bulk-phase-2-promotion.md:58
docs/project/specs/2026-07-02-bulk-phase-2-promotion.md:101
docs/project/specs/2026-07-02-bulk-phase-2-promotion.md:287
docs/project/specs/2026-07-02-bulk-phase-2-promotion.md:399
docs/project/specs/2026-07-02-bulk-phase-2-promotion.md:733
docs/project/specs/2026-07-02-bulk-phase-2-promotion.md:767
```


No matching references found in `.github/**`, `playwright.config.ts`, `vitest.config.ts`, or `benchmarks/playwright.config.ts`.

**5. Risks / Checklist**

Assume POST-WS-C:

- `feature-meta/*` is committed under `src/engine/feature-meta/`, not generated, so `client/lazy-app/feature-meta*` imports should become `engine/feature-meta*`.
- codec worker source is committed, so generated imports of `features/...` should already be real source imports and should rewrite to `engine/features/...`.
- `app-generated` should only cover patched codec wrappers. Do not rewrite `codecs/...` imports; `codecs` alias remains.
- `worker-shared/supports-wasm-threads` becomes `shared/worker/supports-wasm-threads`.


Verification gate for the later session: after moves + rewrites, run `npm run sync`, `npm run check`, and a focused `rg "client/lazy-app|from 'features/|from \"features/|worker-shared/" src tests scripts docs`.