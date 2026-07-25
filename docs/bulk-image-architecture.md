# Bulk image architecture

This document records the framework-neutral bulk engine model. Bulk Phase 2
shipped to production on 2026-07-03; current UI decisions and phased follow-ups
live in [bulk-ui-design-options.md](bulk-ui-design-options.md) and the executed
specs in [specs/](specs/).

The framework-neutral helper surface is exported from `src/client/lazy-app/bulk/index.ts`. UI code should prefer that entry point over deep imports when it needs several bulk helpers together.

The helper surface now includes pure strip item selectors, selected-job detail selectors, and a session summary selector. Future UI should consume those selectors instead of recomputing selected state, effective settings, output state, export readiness, queue slots, override counts, or progress inside components.

Queue UI should consume the queue-state selector rather than calculating active jobs, open slots, or runnable jobs itself. That keeps concurrency behavior consistent between the runner and future controls.

Active bulk statuses are defined by the session model. Queue transitions and snapshot restore/counter logic should use that helper instead of duplicating `decoding`/`processing` checks.

The canonical bulk status list is also exported from the session model. Snapshot validation should use that list so new statuses cannot be added to runtime state without updating restore validation.

Queue status transitions should use the shared job counter delta helper when removing a job from an active or exported state. That keeps direct completion/failure/requeue and batch stale/incomplete/cancel transitions aligned if persisted session counters drift from the job list.

Bulk session mutations should normalize existing counters before applying job-list changes. This keeps appended jobs, removed jobs, and exported jobs from carrying forward stale persisted `activeJobs` or `exportedCount` values.

Queue retry, stale-output requeue, incomplete-job requeue, and active-job cancellation should use the shared queued reset helper so output/error cleanup stays consistent.

Import UI should create sessions through the import-to-session helper so rejected files are kept out of the live session consistently and the first accepted image is selected by the same session rules everywhere.

Import results keep the legacy rejected file list and also include structured rejection reasons. The import summary aggregates those reasons. Future UI should use those reasons to distinguish unsupported files from unreadable files instead of showing a generic failure.

Normal import and MIME-sniffed import record accepted jobs and rejected files through the same internal path. That keeps accepted job IDs, rejection lists, and structured rejection reasons aligned if future bulk import surfaces add drag-and-drop, directory import, or retry flows.

If users add more images after a batch already exists, UI should append through the import append helper. That keeps rejected files out of the session and reuses the same duplicate-safe job ID rules as normal session additions.

Export UI should create an export plan and then mark that plan exported through the plan helper after downloads are triggered. The helper reuses the stale-output guard, so changed global or per-image settings cannot mark old output as exported.

Current-output, ready-for-export, and current-export predicates live in the session model. Queue, export summaries, export entries, and mark-exported flows should use those shared predicates so stale output handling stays consistent.

Processing code should use the process-plan helper before decoding starts. That keeps encoder validation, per-image override merging, source filename selection, and output settings hashes consistent between the current runner and future UI code.

Snapshot restore is metadata-only. It can restore the batch list, original file metadata, settings, selection, errors, and overrides, but it cannot restore live decoded images or optimized output blobs. Restored jobs that depended on live processing output return to `queued` so the app regenerates outputs before export. Use the serialized restore helper when loading a saved snapshot string so parsing and restoration share the same validation path.

## Product goal

The user should be able to:

1. import multiple images;
2. choose global optimization settings;
3. see output size and percentage saved for every image;
4. select one image for detailed before/after review;
5. override settings for that one image without changing the global settings;
6. export all optimized images.

## Core concepts

### Bulk session

A bulk session is the current batch of imported images and settings.

It owns:

- global settings;
- the ordered list of image jobs;
- the selected image id;
- batch progress;
- export state.

### Image job

An image job represents one imported file.

Suggested fields:

```ts
interface ImageJob {
  id: string;
  sourceFile: File;
  status: ImageJobStatus;
  originalSize: number;
  previewUrl?: string;
  thumbnailUrl?: string;
  output?: ImageOutput;
  overrides?: ImageSettingOverrides;
  error?: string;
}
```

Statuses:

```ts
type ImageJobStatus =
  | 'queued'
  | 'decoding'
  | 'processing'
  | 'encoded'
  | 'failed'
  | 'skipped'
  | 'exported';
```

### Global settings

Global settings are the defaults for every image in the batch.

Initial recommended scope:

```ts
interface BulkGlobalSettings {
  encoder: BulkEncoderSettings;
  resize?: BulkResizeSettings;
}
```

Start with WebP as the first encoder target. Add AVIF after the WebP batch flow is reliable.

### Per-image overrides

Overrides should store only values that differ from global settings.

```ts
interface ImageSettingOverrides {
  encoder?: Partial<BulkEncoderSettings>;
  resize?: Partial<BulkResizeSettings> | null;
}
```

Rules:

- If a field is absent, use the global value.
- If a field is present, use the image-specific value.
- If resize is `null`, resizing is disabled for that image even if global resize is enabled.
- The UI should highlight every control with an override.
- The UI should support clearing all overrides for the selected image.

### Effective settings

Effective settings are computed, not stored.

```ts
function getEffectiveSettings(
  globalSettings: BulkGlobalSettings,
  overrides?: ImageSettingOverrides,
): BulkGlobalSettings;
```

This should be a pure function and should have unit tests.

### Image output

```ts
interface ImageOutput {
  file: File;
  size: number;
  downloadUrl: string;
  percentChange: number;
  settingsHash: string;
}
```

`settingsHash` lets the app decide whether an image output is still valid after
settings change. The hash is a normalized effective recipe, not a dump of the
raw controls: only the active encoder's options count, disabled resize and
disabled quantize collapse out, enabled resize also collapses out when it does
not change that job's source dimensions, and percentage resize presets resolve
against each job before hashing.

### Session snapshots

Bulk session snapshots are metadata records for handoff, diagnostics, and future persistence planning.

Current module: `src/client/lazy-app/bulk/snapshot.ts`.

Snapshot rules:

- Include durable metadata: session id, global settings, selected job id, job ids, file names, MIME types, sizes, last-modified timestamps, statuses, overrides, errors, and output size summaries.
- Exclude live browser objects: source `File`, output `File`, `ImageData`, `ImageBitmap`, object URLs, blob URLs, workers, and abort controllers.
- Do not store snapshots in `localStorage` as a complete restore mechanism. A snapshot alone cannot restore the user-selected source files after a page reload.
- If full bulk restore is added later, use a deliberate browser storage design such as IndexedDB for file/blob data and keep object URLs as runtime-only values.
- Normalize derived counters before creating a snapshot so persisted/debug metadata does not preserve stale active/exported counts.
- Parse serialized snapshots through the snapshot validator instead of using raw `JSON.parse` results. The parser accepts only the current snapshot version, rejects malformed file metadata, and recalculates derived counters from job statuses.

## Processing behavior

### Import

When files are imported:

1. filter unsupported files;
2. create one `ImageJob` per file;
3. create thumbnails lazily;
4. queue jobs for processing.

Do not decode every full-resolution image immediately if the batch is large.

### Global setting change

When global settings change:

- mark outputs stale only if their normalized effective per-job recipe changed;
- reprocess images whose effective recipe changed;
- preserve image-specific overrides.
- Use `src/client/lazy-app/bulk/changes.ts` helpers when UI code wants the safe default behavior: update settings and requeue only outputs that became stale.

### Per-image override change

When an override changes:

- update only the selected image job;
- mark that image output stale only when the normalized effective recipe changes;
- reprocess only the affected image or selected image set.
- Use `applyJobOverrides` or `applyClearJobOverrides` so future UI code does not forget the stale-output requeue step.

### Concurrency

Use a small processing concurrency limit.

Recommended initial limit: 2 jobs.

Reasons:

- image decoding can be memory-heavy;
- WASM codecs can use substantial CPU;
- browser tabs can become unresponsive if too many images process at once.

## Memory rules

Bulk mode must avoid keeping too much image data alive.

Rules:

- Store source `File` objects.
- Store object URLs for thumbnails/previews only when needed.
- Revoke object URLs when replacing or removing them.
- Shared cleanup helpers live in `src/client/lazy-app/bulk/urls.ts`.
- The lab keeps a small per-job output cache keyed by normalized settings hash
  so returning to a prior recipe can restore instantly. Cache eviction/reset
  must revoke object URLs that are not currently displayed.
- Do not keep decoded `ImageData` for every image forever.
- Cache the selected image more aggressively than background images.
- Consider an LRU cache for decoded image data later.

## UI shape

Initial layout:

- main comparison area on top;
- global settings panel;
- bottom image strip;
- export controls.

Image strip item should show:

- thumbnail;
- status;
- output size;
- percentage saved or increased;
- override indicator;
- error marker if failed.

Selected image view should show:

- before/after comparison;
- original size;
- output size;
- percent change;
- active effective settings;
- overridden controls.

## Export behavior

First implementation:

- export all encoded outputs;
- skip failed images and report them;
- trigger individual downloads if ZIP is not implemented yet.

Later implementation:

- export ZIP;
- support naming templates;
- preserve relative folder paths if folder import is added.

## Current implementation record

The original implementation-order roadmap is superseded by the production bulk
ship. The useful current references are:

- [bulk-ui-design-options.md](bulk-ui-design-options.md) for shipped UI decisions
  and Phase 3+ follow-ups;
- [specs/2026-07-02-bulk-phase-2-promotion.md](project/specs/2026-07-02-bulk-phase-2-promotion.md)
  for the executed lab-to-production promotion;
- [specs/2026-07-02-phase-2b-contextual-left-panel.md](project/specs/2026-07-02-phase-2b-contextual-left-panel.md)
  for the contextual left-panel follow-up.

## Test plan

Start with pure unit tests:

- global settings apply when no overrides exist;
- overrides replace only specified fields;
- clearing overrides restores global values;
- settings hash changes only when the normalized effective per-job recipe changes
  (including source-dimension-aware resize normalization).

Then add browser smoke tests:

- import two images;
- verify two image strip items appear;
- verify at least one output is generated;
- change global quality;
- verify outputs become stale/reprocess;
- override one image;
- verify only that image shows override state.

## Current follow-ups

Open bulk product work now lives in [bulk-ui-design-options.md](bulk-ui-design-options.md):
Phase 3 override polish starts with the options-model minimal slice, followed by
scale/polish, crop, renditions, and eventual single-image convergence.
