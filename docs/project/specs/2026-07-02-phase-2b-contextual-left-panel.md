# Spec: Phase 2b — the single editor's contextual left panel

Last updated: 2026-07-03.
Status: **executed 2026-07-03**.
plus a mobile fix — the Compare-as popover anchors above its trigger).
Decision record: [bulk-ui-design-options.md](../../bulk-ui-design-options.md) §4
("Decision C — what the left side becomes", maintainer, 2026-07-02) and the
roadmap row "2b — Contextual left panel v1" (§8).
Prerequisite: [2026-07-02-bulk-phase-2-promotion.md](2026-07-02-bulk-phase-2-promotion.md)
executed at least through its Stage D (`Status:` there shows the stages
landed). This spec's file paths assume the bulk components live in
`src/lib/bulk/`. **If the promotion has not run yet, STOP — executing this
first would collide with the promotion's `git mv`.**

## Objective

In the single-image editor, the left column's always-on encoder panel is
replaced by an **image-info panel** — filename, original format, file size,
pixel dimensions, and the inferred "≈ 16:9"-style aspect ratio — visually
identical to the bulk editor's info rows, because it **reuses the same
component** (maintainer directive 2026-07-02: "It's already done. We don't
need to recreate it. Reuse the components in a shared way."). A **"Compare
as…"** button summons the second encode side on demand: picking a format
turns the left column back into today's full options panel for live two-slider
A/B; returning to "Original" brings the info panel back. The two-up stage,
the encode engine, undo/redo, and settings persistence are untouched — the
whole feature is a UI-layer swap keyed on one existing value.

## The one mechanism (read this first)

The editor already models "left shows the original" as the pseudo-format
`'identity'` (`src/lib/compress.ts` ~line 35: `SideFormat = OutputFormat |
'identity'`; exported const `IDENTITY`). The left `OptionsPanel`'s format
select already contains `<option value="identity">Original Image</option>`
(`OptionsPanel.svelte` ~line 186) and `isOriginal = format === 'identity'`
(~line 82). Therefore:

> **Left column shows the info panel iff `session.sides[0].format ===
> 'identity'`; otherwise it shows the OptionsPanel exactly as today.**

No new mode state, no store, no session changes. "Compare as…" =
`session.setFormat(0, <picked format>)`. "Back to info" =
`session.setFormat(0, IDENTITY)` — which is ALSO what picking "Original
Image" in the select already does, so the return path exists natively and the
panel swap follows automatically. History integration is free: `setFormat`
already flows through the debounced history watcher, so undo/redo across a
compare toggle swaps the panels correctly with no extra code.

## Non-goals

- No changes to `EditorSession`, `compress.ts`, the encode pipeline, history,
  result cache, or `settings-storage.ts` (wire formats frozen).
- No changes to `Output.svelte` or the two-up stage — with left = identity the
  stage already shows source | encoded, which is exactly the info-panel state.
- No changes to `Results.svelte` (it has its own `prettySize` copy — leave it;
  consolidating it is optional future cleanup, not this spec).
- No "Compare as…" inside BULK mode (bulk's interim multi-format pattern is
  duplicate imports; renditions are a later track).
- No new info rows beyond the bulk set (megapixels, EXIF, has-alpha — design
  doc lists them as "room for more", explicitly later).
- No removal of the "Original Image" option from the left select — it is the
  native return path and stays.
- Right panel untouched.

## Assumptions — re-verify before starting

1. Phase-2 promotion landed: `src/lib/bulk/BatchInfoPanel.svelte` and
   `src/lib/bulk/aspect.ts` exist (post-`git mv`), and `/lab/bulk` is gone.
2. `src/routes/+page.svelte` renders the two panels via
   `{#each sideIndexes as index}` → `<aside class="options
   options-{index + 1}"><OptionsPanel side={index === 0 ? 'left' : 'right'}
   format={session.sides[index].format} …
   onFormatChange={(f) => session.setFormat(index, f)} />` (~lines 193–217).
3. `session.availableFormats = OUTPUT_FORMATS`
   (`editor-session.svelte.ts` ~line 276) — the 5 real encoders, identity NOT
   in the list (the select adds it as its own `<option>`).
4. `BatchInfoPanel.svelte`'s image face renders the info rows as a
   `dl.rows` block — Format / Original size / Dimensions / Aspect (chip,
   `approx` variant) — using a local `prettySize` (SI, base-1000, 3
   significant figures, comment says it matches `Results.svelte`) and
   `inferAspect` from `./aspect`.
5. The View-options popover in `src/lib/editor/output/Output.svelte` is the
   house pattern for a light-dismissed popover (outside-`pointerdown` +
   Escape, focus returned to the trigger, `aria-expanded`).

## Stage plan

Three stages, each a commit (or more if natural), `npm run check` + Svelte
MCP autofixer after each. Work on `main`.

---

### Stage A — extract the shared pieces (no visual change anywhere)

The point of this stage: ONE implementation of the info rows, consumed by
both editors. Bulk must render pixel-identically before/after.

1. **`git mv src/lib/bulk/aspect.ts src/lib/editor/aspect.ts`** and update its
   importers (grep — at least `BatchInfoPanel.svelte`). Rationale: the
   dependency direction in this codebase is bulk → editor, never editor →
   bulk; a shared primitive therefore lives on the editor side.
2. **New `src/lib/editor/pretty-size.ts`**: move `prettySize` (and its
   `SIZE_UNITS`) out of `BatchInfoPanel.svelte` verbatim — SI base-1000,
   3 significant figures. Export as `prettySize(bytes: number): string`.
   `BatchInfoPanel` imports it. (Do NOT touch `Results.svelte`'s own copy.)
   If BatchInfoPanel's hero footer used a split-parts variant
   (value/unit separated), export whatever helper shape it actually needs —
   read the component first and preserve its output exactly.
3. **New `src/lib/editor/ImageInfoRows.svelte`** — the shared, store-free
   presentational component. Cut the image-face `dl.rows` markup + its
   scoped styles (row layout, `dt`/`dd`, the aspect `chip` + `approx`
   styling) out of `BatchInfoPanel.svelte` and paste them here.

   ```ts
   interface Props {
     /** Source file — name is NOT rendered here (headers stay per-consumer). */
     file: File;
     /** Natural pixel dimensions; 0 = not decoded yet (render an em dash). */
     width: number;
     height: number;
   }
   ```

   Rows in this exact order (identical to bulk today): **Format** (the
   format-label helper currently in BatchInfoPanel — move it here),
   **Original size** (`prettySize(file.size)`), **Dimensions**
   (`{width} × {height}` or `—` while 0), **Aspect** (the `inferAspect` chip,
   `≈`-prefixed when `approx`, `—` when dims unknown). This component reads
   NO store and imports nothing from `$lib/bulk` — it must work in the
   single editor where no bulk session exists.
4. **Refactor `BatchInfoPanel.svelte`** to render `<ImageInfoRows {file}
   {width} {height} />` in its image face. Its filename head, override/reset
   row, global face, and celebration footer are untouched.

Gate: `npm run check` green; in the browser, a bulk batch's image face looks
identical to before (compare against a pre-change screenshot).
Commit: `refactor(editor): extract shared ImageInfoRows + aspect + pretty-size
from the bulk panel`.

---

### Stage B — the single editor's info panel + Compare as…

1. **New `src/lib/editor/ImageInfoPanel.svelte`**:

   ```ts
   interface Props {
     file: File;
     width: number;   // session.naturalWidth
     height: number;  // session.naturalHeight
     onCompareAs: (format: OutputFormat) => void;
   }
   ```

   Structure, styled to sit in the same `aside.options.options-1` slot the
   OptionsPanel occupies (match the OptionsPanel's glass-panel section
   styling — same tokens, radii, paddings — so the swap feels native):

   - **Head**: the filename (ellipsized, `title` attr with the full name) —
     mirror BatchInfoPanel's head treatment but in the editor's neutral hue
     (no azure: that color means bulk selection scope).
   - **Body**: `<ImageInfoRows {file} {width} {height} />`.
   - **"Compare as…" section**: a full-width button labeled `Compare as…`.
     Clicking opens a popover listing the 5 encoders from
     `OUTPUT_FORMATS` (label text, e.g. "WebP", "AVIF", …). Picking one calls
     `onCompareAs(id)` and closes. Copy the popover interaction pattern from
     `Output.svelte`'s View-options popover: light dismiss on
     outside-`pointerdown` + Escape, focus returns to the trigger,
     `aria-expanded` on the button. One quiet caption line under the button:
     `Preview the image in a second format, side by side.`
2. **`src/routes/+page.svelte`** — swap the left column by the derived rule.
   Replace the `{#each sideIndexes}` body so index 0 branches:

   ```svelte
   <aside class="options options-1">
     {#if session.sides[0].format === 'identity'}
       <ImageInfoPanel
         file={session.file}
         width={session.naturalWidth}
         height={session.naturalHeight}
         onCompareAs={(f) => session.setFormat(0, f)}
       />
     {:else}
       <OptionsPanel side="left" … />  <!-- exactly today's props -->
     {/if}
   </aside>
   <aside class="options options-2">
     <OptionsPanel side="right" … />   <!-- untouched -->
   </aside>
   ```

   Unroll the `{#each}` into the two explicit asides (clearer than indexing
   tricks inside the each). The right side's props are byte-identical to
   today's.
3. **Close affordance on the left OptionsPanel**: add an optional prop
   `onCloseCompare?: () => void` to `OptionsPanel.svelte`. When provided,
   render a small ✕ button in the panel's header area (title/aria-label:
   `Close comparison — back to image info`) that calls it. `+page.svelte`
   passes `() => session.setFormat(0, IDENTITY)` for the LEFT panel only
   (import `IDENTITY` from `$lib/compress`). The right panel never gets the
   prop, so nothing renders there. Picking "Original Image" in the select
   remains an equivalent return path — both must work.
4. **Comment hygiene**: `OptionsPanel.svelte`'s `sourceName` prop comment says
   "Reserved for an upcoming source-image info display" — update it (the
   display now exists as `ImageInfoPanel`); do not remove the prop.

Behavior notes the executor must preserve (all fall out of the mechanism —
verify, don't code around them):

- Boot: fresh sessions default left = identity → info panel. A user whose
  PERSISTED settings have a left encoder (pre-2b localStorage) boots straight
  into compare mode — correct and intended (faithful restore; wire format
  unchanged).
- In-place file replace (drop 1 file while editing) keeps the encoder recipe
  by design — so a replace during compare stays in compare; the info values
  update reactively via `file`/`naturalWidth`.
- Undo/redo across a compare toggle swaps panels automatically.

Gate: manual smoke (below) + full e2e run — expect failures ONLY in specs
that assumed the left OptionsPanel is always present; fix those tests by
driving "Compare as…" first (that is the new intended UX, not a regression).
Grep `tests/e2e` for `options-1` to find them before running.
Commit: `feat(editor): contextual left panel — image info + Compare as…`.

---

### Stage C — e2e + docs

**C1. New `tests/e2e/left-panel.spec.ts`** (house style: self-contained,
fixture via `fileURLToPath`, both browsers):

1. Load `photo.jpg` → the left column shows the info panel: filename text
   visible; a Dimensions row matching `/\d+ × \d+/`; an Aspect chip present;
   NO left format select (`.options-1 select` absent or count of format
   selects on the page === 1).
2. Click "Compare as…" → popover lists 5 formats → pick WebP → the left
   column now has an OptionsPanel (format select with value `webP`); wait for
   the left encode to finish (download link with `blob:` href on the left
   results footer) — the A/B compare is live.
3. Return path A: set the left select to `identity` ("Original Image") → info
   panel returns. Re-enter compare, then return path B: click the ✕
   close-compare button → info panel returns.
4. Undo (`Cmd/Ctrl+Z`) after entering compare → info panel returns (history
   integration); redo → options panel again.

**C2. Docs sweep** (registry triggers; hand-formatted Markdown, separate
commit from code):

| Doc | Change |
|---|---|
| `docs/project/brief.md` | Current State entry: Phase 2b landed (what/why/commits). |
| `docs/README.md` | This spec's registry row → done; priority table note if bulk row references 2b. |
| `docs/bulk-ui-design-options.md` | §4 + roadmap row 2b → implemented, date, pointer here. |
| `docs/parity-audit.md` | New §A deviation entry: the left side defaults to an image-info panel; the always-on second encoder panel became the opt-in "Compare as…" (Squoosh shows two encoder panels always). |
| `docs/user-guide/` | `editor-features.md` (or the page describing the two panels): rewrite the left-panel description — info at a glance + how to summon the comparison; update `reference/features.md`. |
| This spec | `Status: done`. |

Commits: `test(e2e): left-panel info + compare-as coverage`, then the docs
commit(s).

## Interfaces & data shapes

- `ImageInfoRows.svelte` props: `{ file: File; width: number; height:
  number }` — store-free, no `$lib/bulk` imports.
- `ImageInfoPanel.svelte` props: `{ file: File; width: number; height:
  number; onCompareAs: (format: OutputFormat) => void }`.
- `OptionsPanel.svelte` gains `onCloseCompare?: () => void` (optional; ✕
  renders only when provided).
- `src/lib/editor/pretty-size.ts` exports `prettySize(bytes): string` (SI
  base-1000, 3 sig figs — moved, not rewritten).
- `src/lib/editor/aspect.ts` — moved module, API unchanged
  (`inferAspect(w, h): InferredAspect`).
- The mode rule (repeat): info panel ⇔ `sides[0].format === 'identity'`.
  There is NO other flag anywhere.

## Edge cases (input → required behavior)

| Input | Required behavior |
|---|---|
| Fresh load, no persisted settings | Info panel on the left (left defaults to identity). |
| Persisted left format = encoder (pre-2b user) | Boots into compare mode with that encoder — do not "fix". |
| Dimensions not yet decoded (width/height 0) | Dimensions + Aspect rows render `—`; no NaN, no layout jump on fill-in. |
| SVG source | Format row "SVG"; dims from `naturalWidth/Height`; aspect chip normal. |
| Compare as → same format as right side | Allowed (valid A/B of settings within one format — today's behavior too). |
| In-place file replace during compare | Stays in compare (recipe-keep policy); info values would update if returned. |
| Undo past the compare entry | Panel follows the restored `sides[0].format` — info panel reappears. |
| Popover open + Escape / outside click | Closes, focus back on the trigger, no format change. |
| ✕ close-compare while left encode in flight | `setFormat(0, IDENTITY)` — the session already handles abandoning a side's work on format change today; no special code. |
| Mobile (375 px) | Info panel occupies the same responsive slot as the panel it replaced; verify no overflow and the popover fits on screen. |

## Test plan

- E2E: the 4 cases in C1, chromium + webkit.
- Existing e2e: full suite green; any spec touching `.options-1` updated to
  enter compare mode first (intended change — update tests, never add
  compatibility hacks to the UI).
- No new unit tests required (no engine change); if `inferAspect` or
  `prettySize` lacked unit coverage and the move makes adding it trivial,
  a small `tests/unit/` file is welcome but optional.

## Acceptance criteria

1. `npm run check` exits 0; `npm run test:e2e` exits 0 (both browsers)
   including `left-panel.spec.ts`.
2. `rg "prettySize|inferAspect" src/lib/bulk/BatchInfoPanel.svelte` shows
   imports from `$lib/editor/…`, not local definitions.
3. `rg -l "labBulk|bulkStore|\\$lib/bulk" src/lib/editor/ImageInfoRows.svelte
   src/lib/editor/ImageInfoPanel.svelte` outputs nothing (shared components
   are bulk-free).
4. In a fresh profile: loading one image shows filename, Format, Original
   size, Dimensions, Aspect on the left; the page has exactly one format
   select until "Compare as…" is used.
5. Bulk mode's image face is visually unchanged (before/after screenshot or
   preview_inspect of the rows).
6. `docs/` rows in C2 all updated; this spec `Status: done`.

## Verification

```sh
npm run check
npm run test:e2e
npm run dev   # then manual smoke:
```

Manual smoke: load a JPEG → info panel (all five facts correct — cross-check
size/dimensions against Finder); Compare as → AVIF → two-slider A/B works,
divider drags, left results footer shows the AVIF size; select "Original
Image" → info returns; Compare as → WebP → ✕ → info returns; Cmd+Z twice →
walks back through the format changes; drop a replacement image mid-compare →
compare persists, new image encodes. Mobile viewport 375×812: panel + popover
fit. Autofixer on all touched `.svelte` files.

## Guardrails

- Do NOT modify `EditorSession`, `compress.ts`, `settings-storage.ts`,
  `Results.svelte`, `Output.svelte` (except zero — the popover pattern is
  COPIED from it, not extracted), the engine, or anything under
  `src/client/` / `codecs/`.
- Do NOT introduce a new mode flag/store for the panel swap — the format IS
  the state.
- Do NOT re-implement the rows in the new panel — Stage A's shared component
  is the only source (the maintainer's explicit directive).
- Do NOT auto-format Markdown; commit code and docs separately; commit on
  `main`; never push unless asked.
- If bulk's BatchInfoPanel turns out to have diverged from the paths/markup
  described here (promotion may have evolved it), adapt the extraction to
  what exists — but if the divergence is structural (no image face / no
  rows), STOP and report.

## Anticipated mistakes

1. **Using `'original'` as the format value.** The pseudo-format is
   `'identity'` (the select LABEL is "Original Image"). Every comparison and
   `setFormat` call uses `'identity'` / the `IDENTITY` const.
2. **Rebuilding the rows instead of extracting them** — then bulk and single
   drift. Stage A moves the markup; Stage B only composes it.
3. **Making `ImageInfoRows` read the bulk store** (it currently lives inside
   a component that does) — it must be pure props; criterion 3 catches this.
4. **Importing from `$lib/bulk` in an editor component** — wrong dependency
   direction; move shared code to `$lib/editor` instead.
5. **Removing or hiding the "Original Image" select option** to "simplify" —
   it is a return path and pre-2b muscle memory; both return paths ship.
6. **Adding a `showInfoPanel` state flag** that can desync from the format —
   the derived rule is the whole design.
7. **"Fixing" persisted left-encoder settings to force the info panel on
   boot** — faithful restore is intended; do not touch settings-storage.
8. **Patching e2e failures by keeping a hidden left OptionsPanel in the
   DOM** — update the tests to the new UX instead.
9. **Styling the filename head azure** — azure means bulk's selection scope;
   the single editor uses the neutral panel hue.
10. **Forgetting the right panel renders unconditionally** when unrolling the
    `{#each}` — the swap is left-column only.

## If things break

| Symptom | Likely cause | Look first |
|---|---|---|
| Info panel never appears | Left side booted with a persisted encoder format | Expected — clear site data or pick "Original Image"; not a bug |
| Panel doesn't return on "Original Image" | Compared against `'original'` instead of `'identity'` | The `{#if}` in `+page.svelte` |
| Bulk image face looks different | Extraction changed markup/styles | Stage A diff vs the pre-change BatchInfoPanel |
| `✕` shows on the right panel | `onCloseCompare` passed to both panels | +page.svelte props — left only |
| Aspect chip missing/wrong | `inferAspect` import path stale after the move | `$lib/editor/aspect` imports |
| e2e reds in old specs | They assumed an always-on left OptionsPanel | Update the spec to enter compare mode first |
| Popover stays open / steals focus | Light-dismiss pattern not copied fully | Output.svelte's View-options handlers (outside-pointerdown + Escape + focus return) |

---

## TLDR

The left column of the single-image editor swaps between the (new, shared)
image-info panel and today's OptionsPanel based on one existing value:
`sides[0].format === 'identity'`. Stage A extracts the bulk panel's info rows
+ aspect + size formatting into `$lib/editor` shared components (bulk
re-consumes them, pixel-identical); Stage B adds `ImageInfoPanel` with the
"Compare as…" popover (→ `setFormat(0, f)`) and a ✕ return affordance; Stage
C adds a 4-case e2e spec and the docs sweep. No engine, session, storage, or
stage changes anywhere. Execute only AFTER the Phase-2 promotion spec.
