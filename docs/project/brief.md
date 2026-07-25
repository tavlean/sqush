# Project brief: Frisp

Last updated: 2026-07-25.

Intent, where things stand, and what is still undecided. Read this and
[../README.md](../README.md) (the docs index) before starting work.

## What this is

Frisp is a privacy-first, fully client-side image optimizer at
[frisp.app](https://frisp.app): a maintained modern fork of GoogleChromeLabs'
Squoosh, rebuilt on SvelteKit 2 and Svelte 5 as a static SPA under Apache-2.0.
Users drop, pick, or paste an image; the browser decodes, resizes, adds grain,
quantizes, and encodes locally through WASM codecs in workers, multi-core where
the browser allows. Nothing is ever uploaded. It installs as a PWA and works
offline after the first load.

The audience is everyday users optimizing images without a server, and the
maintainer's own daily work (single images and SVGs especially). Two planned
articles about the migration and the codec sweep are a side goal; the source
material is [../journey-and-article-notes.md](../journey-and-article-notes.md).

Hosting is a Cloudflare Worker named `frisp` serving static assets, configured
by the root `wrangler.jsonc`. Workers Builds CI is not connected, so deploys are
a manual `wrangler deploy`. The retired `sqush.app` and `presk.app` zones 301
here through a shared sunset Worker in `infra/sqush-sunset/`.

Brand identity lives in exactly one place, `src/shared/brand.ts`: `APP_NAME`
(`Frisp`) for anything a person reads, `APP_SLUG` (`frisp`) for identifiers such
as the CLI, package, domain, and filenames. Every internal identifier is
deliberately brand-free, so a future rename is a small task rather than a
project. Procedure: [../project-identity.md](../project-identity.md).

## Architecture in brief

- SvelteKit 2.61 + Svelte 5.55 runes, Vite 8, adapter-static, `ssr = false`.
- Editor state: `src/lib/editor/editor-session.svelte.ts` (`EditorSession` plus
  two `SideRuntime`s), `editor-history.svelte.ts` for undo/redo,
  `src/lib/result-cache.ts` (LRU signature to result), `settings-storage.ts` for
  localStorage persistence. Signature and cache-key logic lives ONLY in
  `src/lib/editor/encode-signature.ts`.
- Framework-neutral headless pipeline under `src/client/lazy-app/image-pipeline*`,
  with a complete pure-reducer bulk engine in `src/client/lazy-app/bulk/` and its
  production store and UI in `src/lib/bulk/`.
- Codecs: committed WASM under `codecs/`, reached through Comlink workers via
  `src/lib/sveltekit-worker-bridge.ts`. Each side keeps a persistent bridge,
  in-flight encodes dedup, and one canonical recipe signature.
- Generated modules are committed source; `npm run sync` only patches the
  Emscripten wrappers. One JSON manifest, `src/shared/codec-asset-records.json`,
  feeds both the app and the static-output audit.
- Threading: COOP/COEP everywhere; oxipng, AVIF, and JXL run multi-core with a
  single-thread fallback intact.
- Service worker and PWA: `src/service-worker.ts`, variant-aware precache,
  prompt-to-refresh.

## Current state (2026-07-25)

The SvelteKit migration is concluded and `main` is the production app. All seven
WASM codecs were rebuilt from source natively in 2026-06, closing 14 CVEs, and
the multi-threaded runtime is verified in Chromium and WebKit. Gates are green:
`npm run check` reports 0 errors (57 warnings, all the same unknown CSS
`corner-shape` property), the unit suite passes, and Prettier is clean.

Shipped since then, newest first:

- **Lab restructure and design unification (2026-07-18).** `/lab` is a two-door
  index with a tab bar that flips skins in place, and all three editor skins got
  one bar system, docked zoom clusters, and a shared Nucleo icon set. The
  re-style direction is still undecided. Registry: [../lab.md](../lab.md).
- **Web Share for saved images (2026-07-17).** `src/lib/share-file.ts` plus a
  quiet Share button beside Save, rendered only when the OS sheet accepts the
  exact output file. Details: [../mobile-save-ux.md](../mobile-save-ux.md).
- **Rebrand and new landing (2026-07-15).** New logomark and theme-aware SVG
  favicon; the intro lab's `frame` design promoted to
  `src/lib/editor/intro/Intro.svelte`. Dev-only `/lab` and `/bench-svg` routes
  are stripped from production builds by the `app-strip-dev-only-routes` Vite
  plugin and guarded by `audit:static-output`.
- **SVG optimization (2026-07-12).** SVG sources get a first-class "SVG
  (optimized)" output: SVGO 4 in a lazy worker, Auto candidate search gated by
  pixelmatch, vector-true preview, gzip reporting. Stages S1 to S6 are done; the
  S8 competitive benchmark against nano and ImageOptim is the one open piece and
  its protocol is self-contained in the spec.
- **Film grain (2026-07-12).** A processor step between resize and quantize with
  a single Amount slider calibrated 1:1 against Luminar Neo reference exports,
  plus an Advanced grain-size control and live scrub preview.
- **First-principles review executed (2026-07-07).** Every day-one workstream
  landed: decoded-source cache, per-slot bulk drain, codegen retirement, worker
  transfers, dead-code removal, tooling and CI fixes. Remaining workstreams are
  fully specced.
- **Bulk Phase 2 and 2b (2026-07-03).** Production bulk on the main route with
  ZIP save-all, folder import, remove with Undo, and a shared image-info panel
  in the single editor plus an opt-in "Compare as..." second side.

Branch `claude/clever-swartz-2b34ed` is kept deliberately (maintainer,
2026-07-02). Its unmerged experiments (compare-size chips with a best badge,
fit-under-target binary search, shared Adjust state) are idea material for a
later phase. Do not delete it.

## Intentions and priorities

1. **Finish the SVG benchmark (S8).** The maintainer optimizes SVGs daily, so
   this track outranks the codec batch. Resume from the protocol in
   [specs/2026-07-12-svg-optimization.md](specs/2026-07-12-svg-optimization.md).
2. **Bulk Phase 3 overrides polish**, but the codec-options-model minimal slice
   first per the sequencing analysis in
   [../codec-options-model.md](../codec-options-model.md).
3. **Pick an editor re-style direction** from the three lab skins, then promote.
4. **Keyboard control**: a Figma-style single-key proposal is ready at
   [../keyboard-control.md](../keyboard-control.md) with five open decisions.
5. **The 2026-07 codec batch**: libjxl 0.12 upgrade, jpegli, JPEG to JXL
   transcode (blocked on the upgrade), auto-quality mode. All specced.

The full phased plan with status is [roadmap.md](roadmap.md).

## Hard open questions

- **Editor re-style direction.** Porcelain, darkroom, or hybrid, and how much of
  each survives contact with the production feature set.
- **Bulk scope switching.** How selection and global editing stay unambiguous.
- **Mixed-size batches.** Whether the global resize rule is a percentage or
  fixed dimensions.
- **Memory ceiling for N images.** Decode-on-demand, thumbnail strategy, LRU.
- **Whether the codec-options-model refactor precedes the override UI.**
- **The Frisp CLI.** Analysis and a recommendation exist at
  [../frisp-cli-analysis.md](../frisp-cli-analysis.md); the go decision and two
  design questions are open.
- **HEIC.** Still undecided in
  [../new-codec-investigation.md](../new-codec-investigation.md).

## Constraints and non-goals

- No server-side processing and no upload paths, ever. Offline must keep working.
- The single-image workflow is protected. Bulk must never degrade it.
- The engine stays framework-neutral and pure. UI wraps it and never forks
  `EditorSession`.
- Never store live blobs or object URLs in localStorage; snapshots are
  metadata-only. The `app:settings:v3` schema is frozen.
- A native wrapper shipping native codec binaries is the only route to true
  native-CPU speed, but it loses the zero-install advantage and is a separate
  product. Not planned.

## Pointers

- [../README.md](../README.md) is the docs index; load only what a task needs.
- [../overview.md](../overview.md) for the architecture in one page,
  [../build-and-runtime.md](../build-and-runtime.md) for the build and asset
  wiring, [../gotchas.md](../gotchas.md) for silent traps.
- [worklog.md](worklog.md) for the session narrative,
  [issue-list.md](issue-list.md) for small fixes,
  [ledger.md](ledger.md) for when each heavy audit last ran.
- Style tie-breaker files are listed in [../../AGENTS.md](../../AGENTS.md), which
  is their single source of truth.
