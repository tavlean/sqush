# Presk rename runbook (Sqush → Presk)

> **Status:** GitHub rename ✅ · Phase A ✅ · Phase C tavlean.com ✅ · Phase D folder rename ✅ (2026-07-05, incl. local dev-tool session-state migration) · `sqush.app`→`presk.app` 301 redirect LIVE (Cloudflare Redirect Rule + proxied `192.0.2.1` A record on the sqush.app zone) · tavlean registry `repo` + `.claude/launch.json` cleanup ✅ · **Phase E rename-proofing ✅ (2026-07-05)** — brand isolated to `src/shared/brand.ts` + internal identifiers de-branded (see Phase E). **Phase B codec-`squoosh` = still DEFERRED** — a rename-only attempt was made and REVERTED (see Phase B). **Phase F sunset Worker ✅ COMPLETE (2026-07-05)** — Worker live on sqush.app, Redirect Rule deleted, kill-switch + query-preserving 301s verified. Remaining: Phase B rebuild (do with next codec upgrade), logo/favicon art whenever (no text in them — user).
> **This file intentionally contains the old name "sqush" as rename targets — EXCLUDE it from any automated `sqush→presk` replace.**

Renaming the project from **Sqush** to **Presk**.
- App name: `Sqush` → `Presk`
- Domain: `sqush.app` → `presk.app`
- GitHub repo: `tavlean/sqush` → `tavlean/presk`
- Dev folder: `…/Tavlean/Sqush` → `…/Tavlean/Presk`

## Safety invariants (do not violate)

1. **Commits stay signed & correctly attributed.** Config is verified good: `commit.gpgsign=true`, author `tavlean <71072795+tavlean@users.noreply.github.com>`. After each commit, spot-check `git log --show-signature -1`.
2. **Merge to `main` fast-forward only** (`git merge --ff-only`). NEVER `--rebase` (rewrites commit objects → strips signatures → "Unverified").
3. **The worktree stays.** `.claude/worktrees/clever-swartz-2b34ed` (branch `claude/clever-swartz-2b34ed`) is kept. It is nested inside the repo, so a folder rename moves it too — fix its internal absolute paths afterwards with `git worktree repair`. Do NOT `git worktree remove` it.
4. **Keep all Squoosh attribution.** Credit/provenance/history prose that credits the upstream Squoosh project stays. (The `Sqush→Presk` replace is a *different string* from `Squoosh`, so it structurally never touches attribution — good.)

## Two-string model

- **`Sqush` / `sqush`** = our own project name → rename to `Presk` / `presk` **everywhere** (code, docs incl. history, config, assets, SW cache name, internal identifiers). This is **Phase A** (now).
- **`Squoosh` / `squoosh`** = inherited upstream identifiers.
  - Attribution prose → **keep forever**.
  - In-code identifiers (vendored codec files `codecs/**/squoosh_*.{js,wasm,d.ts}`, Rust crate names `squoosh-oxipng`/`squoosh-resize`, stray `squoosh` var/comment names in `src/`) → rename to `presk` in **Phase B (deferred)** — requires a WASM/codec rebuild, so it's isolated to its own pass.

## DO-NOT-auto-touch paths

`codecs/**` (vendored + build artifacts — Phase B, needs rebuild), `LICENSE`/`NOTICE`, `node_modules/**`, `.svelte-kit/**` (generated — regenerated, not hand-edited), and **this runbook**.

---

## Phase A — In-repo Sqush → Presk (this repo, branch `rename/presk`)

Each numbered group = one checkpoint commit.

- [x] **A0 — Prep** ✅ done: stopped Sqush `vite dev`; created branch `rename/presk`; wrote this runbook.
- [x] **A1 — Identity & metadata:** `package.json` (`name`, `homepage`), copyright headers `Sqush Contributors → Presk Contributors`, `package-lock.json` root name.
- [x] **A2 — User-visible strings:** doc title `Sqush — Compress an image` (`editor-session.svelte.ts`), SW-update snackbar copy (`+page.svelte`), diagnostics `<title>`/`<h1>`/body, `Intro.svelte` wordmark `alt`, brand mentions in comments.
- [x] **A3 — Brand asset:** `git mv static/sqush-wordmark.svg static/presk-wordmark.svg` + update ref in `Intro.svelte`. Check `static/logo.webp`/favicons for embedded wordmark art (re-export later if needed — tracked in User Actions).
- [x] **A4 — SW cache name:** `sqush-${version}` → `presk-${version}` in `src/service-worker.ts` (safe cache-bust; activate handler purges old keys).
- [x] **A5 — Internal identifiers:** `registerSqushServiceWorker` → `registerPreskServiceWorker` (def + call sites); `.sqush-editor` CSS class → `.presk-editor` (theme.css, +page.svelte, FocusView, BulkMode).
- [x] **A6 — `sqush-generated` alias (COUPLED — atomic):** rename `sqush-generated → presk-generated` across `scripts/patch-codec-wrappers.mjs`, `scripts/audit-static-output.mjs`, `svelte.config.js`, `vite.config.ts`, `tsconfig.json`, and importers (`src/lib/codec-assets.ts`, `service-worker-codec-assets.ts`, `sveltekit-worker-bridge.ts`, `webp-encode-probe.worker.ts`). Then `rm -rf .svelte-kit && npm run sync` to regenerate.
- [x] **A7 — Docs:** `Sqush → Presk` across `docs/**` and `README.md`, `AGENTS.md` (preserve every `Squoosh` attribution; leave history docs factually intact, rename own-name only).
- [x] **A8 — Verify:** ✅ `npm run check` green (svelte-check + build + static-output audit); `npx playwright test` = **61 passed / 1 pre-existing skip / 0 failed** (codecs, AVIF+JXL+OxiPNG MT threading, offline SW all pass). squoosh occurrences unchanged (code 99→99, docs 234→234).
- [x] **A9 — Merge:** ✅ ff-only merged to local `main` (`4e939be3..17d33f7c`); all 3 commits `sig=G`, author `tavlean`. **Push pending** — bundled with the GitHub repo rename below.

## Phase B — Deferred: in-code `squoosh` → `presk` (REQUIRES a WASM rebuild)

**⚠ 2026-07-05: a rename-ONLY pass was attempted and fully REVERTED (`git reset`, nothing committed).** Why it can't work without recompiling: `wasm-bindgen` **bakes the crate name into each `.wasm` binary's import-module string** (`./squoosh_oxipng_bg.js`, `./squoosh_resize_bg.js` — verified with `grep -a` on the binaries). Renaming the glue's import key to `presk_*_bg.js` while preserving the binary makes the import object no longer match the binary → wasm fails to instantiate. Result: 12 e2e failures (oxipng ST+MT, resize, hqx, alpha) that **time out** (13.9 min run) while un-renamed C++ codecs (webp/avif/jxl/mozjpeg) pass. The build + svelte-check + static-output audit ALL passed — only *runtime* instantiation broke — so **build-green is NOT sufficient; must run e2e**.

Findings to reuse next time:
- **`src/**` `squoosh` refs are ALL attribution** ("adapted from Squoosh…") EXCEPT 4 import paths in `src/features/encoders/oxiPNG/worker/{oxipngEncode,runtime}.ts`. Keep the comments.
- Rust codecs to rebuild (wasm-pack): **oxipng** (`pkg/` ST + `pkg-parallel/` MT-rayon), **resize**, **hqx**. `rotate` crate name is cosmetic (lib name / output is `rotate`, no `squoosh_*` artifact).
- **MT builds are finicky** — need `target-feature=+atomics,+bulk-memory` + `link-arg=--shared-memory`/`--max-memory`/`--import-memory`/tls exports (visible in `codecs/oxipng/target/**/.fingerprint`; see `docs/codec-build-notes.md` + `docs/codec-upgrade-runbooks.md`). Verify MT threading still engages via the `*-threads` e2e specs after rebuild.
- **Correct procedure:** rename Cargo crate `name` (`presk-oxipng`/`presk-resize`/`preskhqx`) → `wasm-pack build` each (with the MT recipe for oxipng-parallel) → the regenerated `pkg/` files + binary import namespace become `presk_*` consistently → update `the retired generator script`, `scripts/audit-static-output.mjs`, the 4 src imports → `npm run check` **AND** `npx playwright test`.
- **Keep attribution:** `codecs/rotate/rotate.rs` upstream Squoosh PR link, `codecs/README.md` provenance, all `src/**` comments, and `codecs/build-rust.sh`'s `squoosh-rust` toolchain image (or rename + retag the docker image).
- This is execution-heavy; confirm the toolchain first.

## Phase C — tavlean.com (separate repo: `…/Development/Websites/tavlean.com`) — DO right after GitHub rename

> Pulse matches repos by GitHub `origin` remote (case-insensitive) — do this in lockstep with the GitHub rename or Pulse loses Sqush's history. Generator: `scripts/build-pulse.mjs`.

- [x] `scripts/projects-registry.mjs` entry: `name Presk`, `slug presk`, `github tavlean/presk`; **kept `repo:'Tavlean/Sqush'`** (folder deferred → flip to `Tavlean/Presk` at Phase D).
- [x] `git mv` route folder `projects/(_)/sqush/ → …/presk/`; content updated (name, `presk.app`, github URL, `/projects/presk`, `requireProjectWithTabs('presk')`); fork-of-Squoosh attribution kept.
- [x] **Redirect `/projects/sqush → /projects/presk`** via `static/_redirects` (308). ⚠ Learning: a route stub broke prerender (projects are globbed by `_meta` and sorted), and `hooks.server.ts` is dead on `adapter-static` — `_redirects` is the Cloudflare Pages mechanism.
- [x] Rebuilt Pulse (`npm run sync:pulse`) → `pulse-data.json` regenerated (77 sqush hrefs → presk); one historical day-summary name fixed too.
- [x] `docs/project-registry.md` updated (`assets.md` had no `sqush`).
- [x] Build green; 2 signed commits (`8a9760b`, `ffa9020`) pushed → Cloudflare auto-deploys.

## Phase D — Folder rename (DEFERRED by choice — app never references the folder name, so nothing breaks)

Local dev-tool session state keyed by the old folder path was migrated as part of the rename.

Run in a fresh terminal when ready (this breaks any live session's cwd + running vite):
```
# 1. stop any Presk/Sqush vite/watchers first
mv /Users/tav/Development/Tavlean/Sqush /Users/tav/Development/Tavlean/Presk

# 2. finish the repo
cd /Users/tav/Development/Tavlean/Presk
git worktree repair                      # fixes the nested worktree's absolute paths
rm -rf .svelte-kit .tmp node_modules/.vite
npm run dev                              # confirm clean boot

# 3. follow-up: tavlean registry repo:'Tavlean/Sqush' → 'Tavlean/Presk'
```

## Phase E — Rename-proofing ✅ (2026-07-05)

Done so a future rename never again touches app internals. A rename now = edit
`src/shared/brand.ts` (`APP_NAME`), `package.json` name/homepage, re-point the
domain, swap brand art, grep-replace prose docs. Nothing else.

- `src/shared/brand.ts` — the ONLY place the name lives in code; user-visible
  strings (doc title, SW-update snackbar, wordmark alt, diagnostics page, bulk
  ZIP download name) all derive from `APP_NAME`.
- Internal identifiers de-branded (behavior-preserving; verified by full e2e):
  `.presk-editor`→`.editor-root` · alias `presk-generated`→`app-generated` ·
  `__preskEmscripten*`→`__appEmscripten*` · `registerPreskServiceWorker`→
  `registerServiceWorker` · SW cache `presk-${version}`→`app-${version}` ·
  bulk ids `presk-bulk-N`→`bulk-N` · probe scheme `presk-diagnostics://`→
  `diagnostics://` · `static/presk-wordmark.svg`→`static/wordmark.svg`.
- **localStorage keys renamed ONE FINAL TIME** `presk:*`→`app:*` — keys are
  storage schema, not branding; this was free only because the domain cutover
  days earlier had already reset all client storage. They are FROZEN now and
  must never follow a rebrand again (see the HARD RULE in
  `src/lib/editor/settings-storage.ts`).

## Phase F — sqush.app sunset Worker (zombie-SW fix) — deployed

The old app is an offline-first PWA: its SW serves the shell **cache-first**,
and the browser's SW-update fetch to `sqush.app/service-worker.js` now gets a
cross-origin 301, which per spec FAILS the update — so returning sqush.app
visitors are pinned to the old cached app forever and never see the redirect.
Fix (built 2026-07-05, in `infra/sqush-sunset/`): a Worker on the sqush.app
zone that serves a self-destructing kill-switch SW at `/service-worker.js`
(deletes caches, unregisters, re-navigates tabs) and 301s every other path to
the same path on presk.app. Verified live that the trap exists (`curl -I
https://sqush.app/service-worker.js` → 301). Cloudflare docs confirm Single
Redirects run BEFORE Workers, so the Worker replaces the Redirect Rule.

- [x] Worker DEPLOYED 2026-07-05 (version `0f0001e5`, route `sqush.app/*`).
- [x] Single Redirect Rule DELETED 2026-07-05 via Rulesets API (rule "Sqush to
      Presk", id `19743bc4…`, ruleset `21a8e08f…`; it had
      `preserve_query_string:false` — the Worker's 301 preserves queries, a
      small upgrade). Trivially recreatable from this record if ever needed.
- [x] Verified live: `/service-worker.js` → `200` `application/javascript`
      `no-cache` + kill-switch body; `/editor?a=b` → `301
      https://presk.app/editor?a=b`; `/` → `301 https://presk.app/`.
      **Phase F COMPLETE — sqush.app is fully served by the sunset Worker.**
- [ ] ~mid-2027: decommission (delete Worker + zone) — see
      `infra/sqush-sunset/README.md`.

## User actions (dashboard / manual)

- [x] GitHub repo renamed `tavlean/sqush` → `tavlean/presk`; remote re-pointed; commits pushed.
- [x] Cloudflare Pages on `presk.app`; `sqush.app` → `presk.app` redirect was replaced by the Phase F Worker.
- [x] Wordmark re-exported as "Presk" (`static/wordmark.svg`, commit `e180977d`).
- [x] Phase F deploy + Redirect-Rule swap — DONE 2026-07-05 (Worker live, rule deleted, verified).
- [x] Logo/favicon art — superseded by the 2026-07-15 Frisp rebrand (new logomark, theme-aware SVG favicon, regenerated rasters; the `.webp` logo assets were deleted).
- [x] `MEMORY.md` + project brief updated to record the rename (2026-07-05).

## Postscript — Presk → Frisp, same day (2026-07-05, evening)

Presk was dropped hours after launch: it is one letter from **Plesk** (the
hosting panel — same dev audience) and the founder himself kept confusing
them. The replacement name **frisp** (lowercase in UI, "Frisp" in prose) was
chosen after a screened search (~1,150 candidates; decision trail in the
session record). Because Phase E had rename-proofed the codebase, the second
rename was executed in one evening:

- Code/docs: `brand.ts` → `'frisp'`, `package.json` name/homepage,
  docs sweep (commit `c030cb78`). `npm run check` + e2e 61/61 green.
- Hosting moved **Pages → Workers static assets** (Cloudflare's recommended
  path for new projects): worker `frisp`, config in root `wrangler.jsonc`,
  `frisp.app` as Worker custom domain. `_headers` (COOP/COEP + immutable
  cache) verified working on the Workers platform in production.
- Old Pages project (`presk`, subdomain `sqush-1ze.pages.dev` — Pages
  projects can't change subdomains, which motivated the platform move):
  `presk.app` domain detached, prod+preview deployments disabled, kept
  dormant; delete after a stability week.
- Sunset: the Phase F Worker (`infra/sqush-sunset/`) now serves BOTH old
  zones — routes `sqush.app/*` + `presk.app/*`, 301 target `frisp.app`,
  same kill-switch SW. presk.app zone got the proxied `192.0.2.1`
  placeholder A record (CNAME to Pages removed).
- tavlean.com: slug `frisp`, `/projects/{sqush,presk}` → 308 `/projects/frisp`,
  pulse data regenerated (commit `98d3e42` there).
Local dev-tool session state keyed by the old folder path was migrated as part of the rename.

Remaining user actions:
- [x] Rename local folder → `/Users/tav/Development/Tavlean/Frisp` and repair the kept worktree.
- [ ] Connect Workers Builds CI: dashboard → worker `frisp` → Settings →
      Build → connect `tavlean/frisp` (build `npm run build`, deploy
      `npx wrangler deploy`, non-prod `npx wrangler versions upload`).
      Until then, deploys are manual `wrangler deploy`.
- [ ] Wordmark/logo art still says Presk / shows the Sqush orange — redo in
      Figma whenever (lowercase "frisp" recommended for the wordmark).
- [ ] ~mid-2028: decommission presk.app zone + its sunset route.
