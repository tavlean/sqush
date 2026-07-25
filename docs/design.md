# Design system

Last updated: 2026-07-25.

> **PLACEHOLDER.** This doc records the conventions that already exist in the
> code; it is not yet a designed system. The production editor and the three lab
> skins currently use two different token vocabularies, which is the main thing a
> design session has to resolve. Design work, labs, and design reviews read this
> file FIRST and update it as decisions land. Nothing here is ratified.

## Where the tokens live

| Surface | File | Vocabulary |
|---|---|---|
| Production editor | `src/lib/editor/theme.css` | `--bg-*`, `--surface*`, `--text-*`, `--accent-*`, `--good`/`--bad`, `--*-radius` |
| Intro and intro labs | `src/lib/lab/intro/intro-lab.css` | `--il-*` |
| porcelain skin | `src/lib/lab/porcelain/porcelain.css` | per-skin |
| darkroom skin | `src/lib/lab/darkroom/darkroom.css` | per-skin |
| hybrid skin | `src/lib/lab/hybrid/hybrid.css` | per-skin |

The editor theme is scoped to `.editor-root` so other routes are unaffected. It
deliberately keeps the variable **contract** the ported Squoosh components were
built against (`--main-theme-color`, `--hot-theme-color`, `--header-text-color`
resolve per comparison side via `.options-1` / `.options-2`), with a block of
legacy aliases mapping the old pink/blue names onto the current palette. Renaming
those aliases is a real refactor, not a rename.

## Conventions in force

- **Two side accents.** Coral is the brand colour and belongs to the left
  comparison side; azure belongs to the right. Size deltas use `--good` and
  `--bad`, never the accents.
- **Dimensions are rem-based** against the 12px root set in `+layout.svelte`.
  New spacing follows that scale rather than introducing pixel values.
- **Theming uses CSS `light-dark()`**, not a class-swapped theme or a JS
  variable. A surface that needs both modes declares both values in one place.
- **Squircles use the CSS `corner-shape` property**, paired with a radius.
  `svelte-check` does not know `corner-shape` and warns on every use; those
  warnings are expected noise, so only a change in the ERROR count matters.
- **Icons are Nucleo**, exported as `currentColor` SVGs. The lab set is 27
  pure-stroke 18px glyphs in `src/lib/lab/icons/` behind `LabIcon.svelte`. The
  exporter strips duotone accent layers, which is why a glyph whose meaning lived
  in an accent layer has to be redrawn rather than re-exported.
- **One canonical brand mark**, `src/lib/brand/logomark.svg`, imported with
  `?raw` and rendered as a single `currentColor` SVG. Never hand-copy the paths.
- **The theme toggle cycles System, Light, Dark** and shows the glyph of the
  mode it is in (sun-moon, sun, moon).

## Open for a design session

- Whether the production editor adopts a re-style at all, and which of the three
  lab skins wins ([lab.md](lab.md) has the registry and the recommendation).
- One token vocabulary across the editor, the intro, and the winning skin,
  replacing the per-skin sets and retiring the legacy pink/blue aliases.
- A documented type scale. Satoshi is the typeface (self-hosted variable woff2,
  weights 300 to 900, plus an italic face, in `static/fonts/`) but the scale it is
  used at has never been written down.
- Motion: there is no shared duration or easing vocabulary yet.
- Whether light mode ships for the production editor, which today is dark only.
