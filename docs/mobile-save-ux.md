# Mobile save/download behavior + the Share button

Last updated: 2026-07-17.

How Frisp's save buttons behave on phones, verified against WebKit and Chromium
sources, and the Share button built on that research (shipped 2026-07-17; see the
last section).

## Where a saved image lands today

Every save in Frisp is an `<a href="blob:…" download>` anchor (single editor:
`Results.svelte`; bulk per-image: `StripCell.svelte`; Save-all ZIP:
`triggerBlobDownload` in `src/lib/bulk/zip.ts`). That is a **file download,
never a photo-library import**, on both platforms:

- **iOS Safari (browser tab):** confirmation prompt → Files app, Downloads
  folder (iCloud Drive → Downloads by default; configurable in Settings →
  Apps → Safari → Downloads). Never reaches Photos.
  ([Apple 102440](https://support.apple.com/en-us/102440))
- **iOS installed PWA (standalone):** blob downloads are still quirky — the
  anchor can open a full-screen Quick Look preview instead of downloading,
  with no obvious way out; the user must manually share/save from the
  preview. Known WebKit issue, unfixed as of mid-2026
  ([WebKit 275288](https://bugs.webkit.org/show_bug.cgi?id=275288)). Frisp
  is installable, so this hits real users.
- **Android Chrome:** saved via `MediaStore.Downloads` → Downloads folder.
  Gallery apps and Google Photos show it under "On this device → Download",
  not the main timeline; no cloud backup unless the user enabled it for that
  folder. The honest promise is "saved to Downloads", not "in your gallery".

## The platform-intended fix: Web Share

`navigator.share({ files: [file] })` opens the OS share sheet; on iOS it
offers **Save Image** (straight into Photos), AirDrop, Messages, etc., and it
works in standalone PWAs — sidestepping the Quick Look bug entirely. Solid
since Safari 16.5 (the iOS 16 "Save Image" regression was fixed 2023-04);
Android Chrome has file-share since 75 (limits: ≤10 files, ≤50 MiB, image
types allowed; **ZIP is not on the allowlist**).

Rules for a correct implementation:

- Feature-detect with the REAL finished file:
  `navigator.canShare?.({ files: [file] })` — a `Blob` is not a `File`, and
  empty-file probes prove nothing.
- Call `share()` directly in the tap handler with the already-encoded file.
  Transient user activation expires — never encode-then-share on one tap.
  (Frisp's Results footer only enables once the encode is done, so this is
  naturally satisfied.)
- Share `files` alone — no `text`/`url` alongside; WebKit can drop the file
  when they're combined ([WebKit 251500](https://bugs.webkit.org/show_bug.cgi?id=251500)).
- "Save Image" only appears for OS-recognized formats (JPEG/PNG/WebP are
  safe; don't promise Photos for JPEG XL or QOI).
- Keep **Download** — share is a complement, not a replacement: on Android
  share doesn't guarantee local persistence, on desktop (where share() also
  exists — macOS Safari, Chrome 128+) users expect a deterministic save,
  and the bulk ZIP can't go through share at all.

## Shipped implementation (2026-07-17)

- `src/lib/share-file.ts` — `canShareFile()` (validates the exact finished
  file) + `share()` (maps AbortError → silent, real failures → a snackbar
  message). All the constraints above are encoded in its comments.
- `Results.svelte` — a quiet circular Share button beside the Save pill
  (mirrored arrow icon), rendered only when `canShareFile` passes and never
  on the Original side; the shared file carries the download name. The bulk
  focus view inherits it through `OptionsPanel`; the bulk global scope hides
  the footer as before.
- **Save-all ZIP stays a download** (ZIP is not Web Share-able). Parked,
  low priority: `showSaveFilePicker()` for the ZIP on Android Chrome 132+.
- Verified: unit tests (`tests/unit/share-file.test.ts`), full e2e suite
  unchanged, and in-browser checks (share payload is `files` alone, renamed
  correctly; failure snackbar; button absent where the API is unsupported).

Squoosh (upstream) never shipped output sharing — it only registers as a
share *target* for incoming images. This is a genuine UX edge over it.
