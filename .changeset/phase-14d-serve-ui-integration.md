---
"contentrain": minor
---

feat(cli/serve-ui): phase 14d — consume 14b + 14c backend capabilities

Wires the Serve UI to the routes and events added in 14b + 14c so the
new backend capabilities become visible to the user.

### New pages

- **`/doctor`** — structured health report from `/api/doctor`. Four
  stat cards (passed / errors / warnings / summary) mirror the
  ValidatePage layout. Per-check rows with severity icon + badge.
  Optional `--usage` mode expands into three collapsible panels
  (unused keys, duplicate dictionary values, missing locale keys),
  each with a 20–50 row preview + overflow indicator. Nav link in
  `PrimarySidebar`.
- **`/format`** — content-format specification from
  `/api/describe-format`, grouped by top-level section. Each
  section is a collapsible Card. Scalar values render inline;
  objects render as labelled rows with `<pre>` for nested
  structures. Nav link in `PrimarySidebar`.

### Extended pages

- **BranchDetailPage** — new "Merge preview" panel fetched on mount
  from `/api/preview/merge`. Renders one of four states:
  - _already merged_ (info — approve is a no-op)
  - _fast-forward clean_ (success — approve will FF cleanly)
  - _requires three-way_ (warning)
  - _conflicts_ (error — lists the conflicting paths)

  Sits above the sync-warning panel so reviewers see the upcoming
  merge outcome before they see the previous merge's outcome.

### Global shell (AppLayout)

- **File-watcher error banner** — when chokidar emits `error` (e.g.
  OS inotify limit), the backend broadcasts `file-watch:error`.
  The layout surfaces a persistent destructive banner with the
  message + a Dismiss button. Mirrors the branch-health banner
  pattern.
- **`meta:changed` toast** — light informational toast when an
  agent edits `.contentrain/meta/<model>[/<entry>]/<locale>.json`.
  No push-back CTA; toast disappears on its own.

### Store + composable

- `stores/project.ts` — new state: `doctor`, `formatReference`,
  `fileWatchError`. New actions: `fetchDoctor({ usage })`,
  `fetchFormatReference()`, `fetchMergePreview(branch)`,
  `setFileWatchError()`, `dismissFileWatchError()`. Types:
  `DoctorReport`, `DoctorCheck`, `DoctorUsage`, `MergePreview`,
  `FileWatchError`.
- `composables/useWatch.ts` — `WSEvent` union extended with
  `meta:changed` and `file-watch:error`. New optional fields
  `entryId`, `timestamp`.

### Dictionary-first

Every new user-facing string uses
`dictionary('serve-ui-texts').locale('en').get()` — no hardcoded
copy. Twenty-three new keys added via `contentrain_content_save`
(auto-merged, committed as two content ops). Reused existing keys
where applicable (`dashboard.run`, `trust-badge.warnings`,
`validate.all-checks-passed`, `validate.errors`, `dashboard.total`).

### Verification

- `vue-tsc --noEmit` → 0 errors.
- `oxlint` across cli src → 0 warnings on 185 files.
- `@contentrain/query` client regenerates `ServeUiTexts =
  Record<string, string>` typing — new keys type-safe at lookup.

No backend changes. Everything here is UI wiring on top of 14b + 14c.
