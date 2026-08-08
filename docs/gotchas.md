# Gotchas

Last updated: 2026-08-08.

Traps that fail **silently**: the build stays green, the tests stay green, and
the damage shows up later. Loud failures are deliberately absent because the
tools already teach those. A gotcha's best home is a comment next to the code;
this doc holds the cross-cutting ones that no single file owns.

## Build and bundle

- **A `{#if dev}` template guard does NOT keep a statically imported component
  out of the production bundle.** Dev-only routes still emit and precache their
  chunks. Only the build-time `app-strip-dev-only-routes` plugin (or a
  `dev`-gated dynamic import that dead-code elimination can drop) removes them.
  `npm run audit:static-output` is the tripwire; keep it passing.
- **`vitest.config.ts` does not inherit `vite.config.ts` aliases.** It imports
  the exported `appAliases`. If the two drift, tests silently resolve nothing and
  whole files stop running. This already happened once and hid a real bug for
  weeks (10 tests dropped, an accidental `frisp-` prefix on bulk ZIP names).
- **`PLAYWRIGHT_SKIP_BUILD=1` serves whatever is already in `build/`.** Set it
  only immediately after a `check` or `build`; a stale `build/` tests old code
  and passes.
- **`wasm-bindgen` bakes Rust crate names into the `.wasm` import strings.** The
  `squoosh_*` codec artifacts cannot be renamed without a rebuild, and a green
  build proves nothing here. Only the e2e suite catches it.
- **Markdown is never auto-formatted.** The Prettier globs and the pre-commit
  hook glob both exclude `*.md` on purpose, and `proseWrap: always` is banned.
  Adding Markdown back reflows every hand-wrapped doc in one commit.

## Runtime

- **`requestAnimationFrame` never fires in a non-compositing context** such as a
  headless e2e run or a background tab. Never use it to schedule state work; use
  a latest-wins drain loop with `setTimeout` yields. This was hit live while
  verifying the grain scrub preview.
- **`pinch-zoom` transforms every child** via a `pinch-zoom > *` rule, not just
  the first. Overlays that must not be pinched opt out with
  `data-pinch-overlay`.
- **`$lib/svg/optimize` must only ever be dynamic-imported.** A static import
  pulls SVGO into the main bundle. An audit tripwire asserts it stays
  worker-side.
- **SvelteKit emits hash-only chunk names**, so service-worker exclusions must
  key on the stable `workers/<name>-` path segment, never on a full filename.
- **WebKit hands out drop items whose `webkitGetAsEntry().file()` rejects** with
  `NotFoundError` even when `getAsFile()` works. Read plain files synchronously
  via `getAsFile`; use the async entry walk for directories only. An entry-first
  read turns such drops into a silent no-op.
- **Web Share needs `files` alone.** WebKit drops the file if `text` or `url`
  ride along, `share()` must be called straight from the tap before the user
  activation expires, and the download name has to be carried onto the shared
  `File`.
- **Svelte 5 flushes class bindings asynchronously.** A `getComputedStyle` sweep
  taken immediately after a state change reads the previous frame.

## Measurement

- **The codec benchmark's warm runs hit the in-session `ResultCache`**, so they
  measure a 9ms poll tick rather than an encode, and cannot see the
  persistent-bridge win. Fix the methodology (bust the cache per run, or reload
  between runs) BEFORE re-baselining; the committed baseline was deliberately
  not refreshed because that would bake cache-hit artifacts into the reference.
- **The `photo-large` bench fixture is a single cold run.** Treat it as a
  regression signal, never as a timing measurement.
- **`benchmarks/baseline.json` is stale for WebP and AVIF *sizes*, not just for
  timing** (measured 2026-08-08). `main` with no codec change now produces
  59302 bytes for WebP on `photo` against the baseline's 49372, and AVIF drifts
  a percent or two; MozJPEG and OxiPNG are still byte-identical. So
  `bench:compare` against the committed baseline will accuse a codec upgrade of
  regressing codecs it never touched. **Capture a control run at HEAD first**
  (`BENCH_LABEL=head-control npm run bench` with the change stashed) and diff
  against that, which is the only way to attribute a size delta.
- **The SVG auto gate deliberately upscales small sources.** Precision loss that
  is invisible at 24px is obvious at 256px.

## Environment and process

- **Dimensionless SVGs** with no `width`, `height`, or `viewBox` are rejected by
  the inherited import contract. They surface as errors in the benchmark and are
  not losses; count them separately.
- **After merging lab branches while `vite dev` is running, the open page can
  hold stale HMR modules**: deleted-file import errors and mixed-theme surfaces.
  Hard-reload before diagnosing anything.
- **Worktree agents need `ln -s <main>/node_modules` and a widened
  `server.fs.allow`** to run the dev server, because the symlink resolves outside
  the default allow-list.
- **`git add <dir>` while a parallel agent is editing that directory stages its
  half-finished work under your commit message.** `git add src` takes whatever is
  on disk at that instant, not what you reviewed a moment earlier, so a diff you
  checked and then staged are two different things. The commit succeeds and its
  message is now false. Either commit before delegating, wait for the agent to
  report, or stage explicit file paths and re-read the staged diff with
  `git diff --cached` before committing.
- **Do not diagnose a lost edit from file mtimes.** A file whose changes were
  absorbed into someone else's commit looks byte-identical to one whose changes
  were reverted: `git status` reads clean in both cases. Check
  `git show <commit> -- <file>` before re-applying anything, or you will redo work
  that already landed.
- **`codex exec` inside a compound background command must end with
  `</dev/null`.** Otherwise stdin never closes and it hangs at "Reading
  additional input from stdin".
- **A sandboxed shell cannot bind the Playwright preview-server port.** Run e2e
  outside the sandbox.
- **Cloudflare's Browser Cache TTL must stay on "Respect Existing Headers".**
  Anything else overrides the app's own cache headers and serves stale assets.
- **Workers static assets serve the SPA fallback via `not_found_handling`**
  returning `/index.html`, so the adapter's `200.html` ships unused. `_headers`
  and `_redirects` work as they did on Pages.
