# contentrain

## 0.12.3

### Patch Changes

- Updated dependencies [b92140a]
  - @contentrain/types@1.7.0
  - @contentrain/mcp@3.1.5
  - @contentrain/query@7.0.11
  - @contentrain/wp-import@0.1.3
  - @contentrain/rules@0.7.0
  - @contentrain/skills@0.8.0

## 0.12.2

### Patch Changes

- Updated dependencies [ca62ade]
  - @contentrain/types@1.6.0
  - @contentrain/mcp@3.1.4
  - @contentrain/query@7.0.10
  - @contentrain/wp-import@0.1.2
  - @contentrain/rules@0.7.0
  - @contentrain/skills@0.8.0

## 0.12.1

### Patch Changes

- Updated dependencies [364af0f]
  - @contentrain/types@1.5.0
  - @contentrain/mcp@3.1.3
  - @contentrain/query@7.0.9
  - @contentrain/wp-import@0.1.1
  - @contentrain/rules@0.7.0
  - @contentrain/skills@0.8.0

## 0.12.0

### Minor Changes

- b082e91: New `contentrain import` command: imports a WordPress site into a `.contentrain` content store — from a WXR export file or a REST URL (`--auth user:app-password` lifts the access rung). Writes the canonical store, `import-report.json`, `entry-source-map.json`, and — when the source has comments — a `contentrain-comments@1` export ready for a comments-service intake. Guards existing stores behind `--force`.

## 0.11.2

### Patch Changes

- Updated dependencies [c0960f8]
  - @contentrain/types@1.4.0
  - @contentrain/mcp@3.1.2
  - @contentrain/query@7.0.8
  - @contentrain/rules@0.7.0
  - @contentrain/skills@0.8.0

## 0.11.1

### Patch Changes

- Updated dependencies [7aa4424]
  - @contentrain/types@1.3.0
  - @contentrain/mcp@3.1.1
  - @contentrain/query@7.0.7
  - @contentrain/rules@0.7.0
  - @contentrain/skills@0.8.0

## 0.11.0

### Minor Changes

- ea328a5: Divergence becomes a product state, and reconcile becomes its exit.

  **Truth first (types, mcp, cli).** A diverged base branch — commits the
  `contentrain` branch lacks, the state a dual-domain migration PR leaves
  behind — is no longer reported as a failed write. The content lands on
  `contentrain` either way; auto-merge writes and `contentrain_merge` now
  return `base_advance: 'advanced' | 'blocked_diverged'` (shared vocabulary
  with Studio's approve contract — a PR is an attachment, never a third
  state) plus `remote_push: 'pushed' | 'rejected' | 'no-remote'`, where a
  non-fast-forward push rejection used to be swallowed silently.
  `mergeBranch` gains the fetch + base-sync pre-step the write path already
  had, so one clean base commit no longer kills every approve; the merged
  `cr/*` branch is pruned even when the advance is blocked, ending the
  phantom pending-review rows in the serve UI. `contentrain_status` and
  `contentrain status` count BOTH directions (`in_sync / content_ahead /
base_ahead / diverged`) — one-directional counting reported the exact
  state that blocks every advance as "in sync". Serve approve endpoints
  return the new fields and carry structured error data; transaction-layer
  fetch/push is hardened (no credential prompts, block timeout).

  **The reconcile primitive (types, mcp).** `planReconcile`
  (`@contentrain/mcp/core/ops`) is a content-aware three-way merge over
  three ref-bound `RepoReader`s (merge-base / contentrain / base). One side
  changed → mechanical merge at entry-, key-, and term+locale granularity;
  both sides changed the same item → a `ConflictItem` with a CLOSED `code`
  union (consumers key localized editor questions on it) and an id that
  hashes position AND values — a resolution made against a stale dry-run is
  dropped and the conflict re-reported (compare-and-set). Document bodies
  are never text-merged; models carry `suggested: 'theirs'` as advice,
  never auto-applied; context.json is always regenerated. `RepoProvider`
  gains optional `getMergeBase`/`createMergeCommit` members and the
  optional `mergeCommit` capability (GitHub: two-parent Git Data API
  commit; GitLab: absent, MR fallback; both keep external `implements`
  code compiling).

  **Executors and surfaces (mcp, cli).** `reconcileBranches`
  (`@contentrain/mcp/git/reconcile`) runs a real `git merge --no-commit`
  in a temp worktree and writes the entire plan over it — the planner is
  authoritative for content paths, git for everything else — then commits
  with two parents and fast-forwards the base. `contentrain_reconcile`
  (new tool, local-only, dry_run-first like `contentrain_apply`) and
  `contentrain reconcile` (interactive CLI: plan summary, one ours/theirs
  question per conflict, `--yes` never defaults a conflict) are the
  product doors. Every `blocked_diverged` surface names them as the exit.

### Patch Changes

- Updated dependencies [ea328a5]
  - @contentrain/types@1.2.0
  - @contentrain/mcp@3.1.0
  - @contentrain/query@7.0.6
  - @contentrain/rules@0.7.0
  - @contentrain/skills@0.8.0

## 0.10.0

### Minor Changes

- d04947f: The serve UI reads the model's declared title, labels and order

  serve-ui was still guessing what `title_field`, `label` and `order` now
  declare. Its column list called `Object.keys(desc.fields)` under a comment
  saying that preserved definition order — it does not, because model JSON is
  written with canonically sorted keys, so it was alphabetical. On a
  sixteen-field article model that put `author` first and `title` fifteenth,
  each column headed by its raw key (`body_public`, `is_category_hero`).

  - columns order by `orderedFieldNames`, so a declared `order` wins and fields
    without one keep today's alphabetical fallback
  - headers render `resolveFieldLabel`, with the raw key kept as the `title`
    attribute so the underlying field is still discoverable
  - the default visible columns lead with `title_field` when the model declares
    one; the existing required-plus-simple-type heuristic fills the rest and
    still covers models that predate the property

  Both helpers come from `@contentrain/types`, so the UI and any other consumer
  resolve them the same way.

  **The secret detector no longer flags documentation about secrets.**

  `SECRET_PATTERNS` matched bare prefixes, so `task_id` and `risk_level` tripped
  `sk_`, every page documenting `Authorization: Bearer <token>` tripped
  `Bearer `, and `postgres://localhost:5432/mydb` in a guide tripped the
  connection-string rule. On this repository, which stores its own docs as
  content, that was **7 of 12 validation errors** — and the real findings were
  buried under them.

  Each pattern now matches a credential-shaped _value_ rather than prose about
  credentials: prefixes need their key body, a bearer token needs an actual
  token (not `<token>`, `$TOKEN`, `{{token}}` or `YOUR_TOKEN`), an api key needs
  to be assigned one, and a connection string needs embedded credentials.

  Two existing assertions changed, because they encoded the false positive:
  `my_api_key_value` and `mongodb://localhost/test` are no longer reported. A
  check that fires on the wrong thing is not a strict check; it is one people
  learn to scroll past.

### Patch Changes

- Updated dependencies [d04947f]
  - @contentrain/types@1.1.0
  - @contentrain/mcp@3.0.3
  - @contentrain/query@7.0.5
  - @contentrain/rules@0.7.0
  - @contentrain/skills@0.8.0

## 0.9.2

### Patch Changes

- Updated dependencies
  - @contentrain/types@1.0.2
  - @contentrain/mcp@3.0.2
  - @contentrain/query@7.0.4
  - @contentrain/rules@0.7.0
  - @contentrain/skills@0.8.0

## 0.9.1

### Patch Changes

- Updated dependencies [0430ce2]
  - @contentrain/types@1.0.1
  - @contentrain/mcp@3.0.1
  - @contentrain/query@7.0.3
  - @contentrain/rules@0.7.0
  - @contentrain/skills@0.8.0

## 0.9.0

### Minor Changes

- 18584a2: feat(types)!: every model declares the field that titles its entries

  Consumers had to guess which field to show as an entry's title, and the guess
  was wrong in ways that made listings unusable: an integration group titled
  `i-lucide-bot` because its description exceeded a length threshold and the
  icon was the next short string; an article titled by its slug; a hero slide
  titled `f3a81c09d24e`, a relation ID.

  Guessing cannot be fixed, only made wrong differently. `title_field` replaces
  it with a declaration.

  Validation, on write and on read:

  - missing, empty or non-string — rejected
  - names a field this model does not declare — rejected
  - names a field whose type cannot render as text — rejected. The allowed set
    is `string`, `text`, `slug`, `email`, `url`, `code`, `markdown`, `richtext`.
    `icon`, `color`, `phone`, `select`, `date`, `image` and `relation` all store
    strings, which is exactly why the rule is by meaning rather than by `typeof`
  - dictionary models have no fields, so their only legal value is the reserved
    `"key"` — the entry key is the title
  - pointing at an optional field is a warning, not an error: the title may
    render empty

  Migration is one command. `contentrain validate --fix` backfills a missing
  `title_field` and reports each choice as a notice naming the rule that made
  it, so a wrong pick is visible and correctable. A `title_field` that is
  present but names the wrong field is reported and never rewritten — filling a
  gap is migration; changing an answer is a decision.

  Verified against this repository's own eleven models: ten resolve by name
  match, and `faq` resolves to `question` rather than `answer` because the
  inference prefers a short scalar over a long-form body.

  BREAKING CHANGE:

  - `ModelDefinition.title_field` is required. TypeScript consumers that
    construct a model will not compile until they add it.
  - `contentrain_model_save` and `contentrain_apply` (extract mode) reject a
    model without a valid `title_field`. Extract infers it from the extracted
    fields when omitted and reports the choice in the dry run; it refuses to
    extract into an existing model that has not been migrated.
  - `contentrain_validate` reports a missing `title_field` as an error, so a
    project that has not been migrated validates red until `--fix` runs.
  - `contentrain validate` now exits 1 on an invalid project. It previously
    printed the errors and exited 0, so a CI step running it passed regardless
    of what it found. `contentrain doctor` has always exited 1.
  - `validate --fix` writes the repaired model on `cr/fix/validate` and
    auto-merges it even under the `review` workflow, as it already did for its
    other structural repairs.
  - `validateModelDefinition`'s input widened to accept `title_field`.
  - `contentrain_doctor`'s `--usage` analysis no longer reports collection entry
    IDs and document slugs as unused keys — they are fetched by query and were
    never referenceable by name. The check covers dictionaries only and is
    renamed 'Unused dictionary keys'. On a real project this removed ~120 of 134
    warnings.
  - Doctor's Models check now validates definitions rather than only parsing
    them, and detects an unparseable model file — which it previously could not,
    because it enumerated models through a helper that silently drops them.

  `MODEL_FIELD_ORDER` moves to `@contentrain/types` as the single definition of
  canonical key order, replacing two copies that had to be kept in step by hand.
  It is exhaustive over `keyof ModelDefinition` by compile-time assertion, so a
  future property cannot be added without placing it.

### Patch Changes

- 2274bac: Resolve the git binary once instead of re-walking PATH on every spawn

  Every local write spawns git dozens of times — a `contentrain_init` is 33
  subprocesses — and each one was spawned by bare name, which makes the OS walk
  PATH looking for it. Measured inside a worker process on a 41-entry PATH:
  198.8ms per spawn by name against 22.0ms by absolute path. A malformed entry
  makes it worse: a PATH containing `/usr/bin/git` — the binary itself, added as
  if it were a directory — turns every probe into an ENOTDIR.

  This is not only a test concern. An MCP server launched from an editor
  inherits that editor's PATH, so every real write operation was paying it.

  - `gitBinary()` resolves the executable once per process; `CONTENTRAIN_GIT_BINARY`
    overrides it
  - `createGit()` is now the single constructor for simple-git across mcp and
    cli, so no call site can silently opt back out

  Resolution is conservative — the first PATH entry holding an executable git,
  the same one the OS would have picked. No attempt is made to bypass the macOS
  `xcode-select` shim, which exists to track the active toolchain.

  Provider contract additions, so an implementation can replace git entirely:

  - `RepoProvider.checkWriteReadiness?()` — the tool layer previously asked
    whether a provider was a `LocalProvider`, then reached through to its
    `projectRoot` to count git branches. It now asks the provider whether it
    will accept a write. Optional; a provider that omits it is always ready.
  - `Commit` gains optional `workflowAction` / `sync` / `warning`, and
    `ApplyPlanInput` gains optional `context` / `workflowOverride`. These were
    real concepts that existed only on a LocalProvider-specific type, which
    forced the dispatch to be nominal rather than capability-based.
  - New `@contentrain/mcp/testing/memory` export: `MemoryProvider`, a complete
    `RepoProvider` over `Map`s with real branch snapshots that reads workflow
    from the project's own config. Intended for suites that test what a tool
    decides rather than what git does with the result.

  No behaviour change for existing consumers: the new contract members are all
  optional, and `LocalProvider` keeps its current semantics.

- Updated dependencies [809b6b1]
- Updated dependencies [b660624]
- Updated dependencies [b33e2ea]
- Updated dependencies [2274bac]
- Updated dependencies [18584a2]
- Updated dependencies [0eebc07]
  - @contentrain/mcp@3.0.0
  - @contentrain/types@1.0.0
  - @contentrain/rules@0.7.0
  - @contentrain/skills@0.8.0
  - @contentrain/query@7.0.2

## 0.8.1

### Patch Changes

- Updated dependencies [297404d]
  - @contentrain/mcp@2.3.1
  - @contentrain/rules@0.6.0
  - @contentrain/skills@0.7.0

## 0.8.0

### Minor Changes

- 716828e: Add `contentrain setup codex`, and stop overwriting shared instruction files

  `setup` auto-configured Claude Code, Cursor, VS Code, Windsurf, and Copilot,
  while the docs told Codex users to run `codex mcp add` by hand. Codex was the
  only documented client without a setup path, which reads as an afterthought
  for the one ecosystem where `AGENTS.md` is the native convention.

  Codex needs two things the other agents do not:

  - **TOML, not JSON.** `.codex/config.toml` holds unrelated user settings
    (model, approval policy, sandbox), so the writer appends a
    `[mcp_servers.contentrain]` table rather than parsing and rewriting the
    file. Appending is valid TOML, needs no parser dependency, and leaves the
    rest byte-for-byte intact. Running it twice is a no-op.
  - **AGENTS.md is the project's file, not ours.** It usually already carries
    the team's own instructions, so the guardrails block is appended once and
    never overwrites.

  That second point fixes a real bug rather than just accommodating Codex. The
  append path for shared instruction files was unreachable — it re-checked
  `pathExists` inside the branch where the file does not exist — so an existing
  `copilot-instructions.md` never received the Contentrain block, and a force
  update would have replaced the project's own instructions wholesale. Both
  Copilot and Codex now append; dedicated files (Claude Code, Cursor, Windsurf)
  are still overwritten on force update as before.

  Codex is detected from `.codex/` only. `AGENTS.md` is deliberately not used as
  a signal — many agents read it, so it would configure Codex for projects that
  never use it.

## 0.7.15

### Patch Changes

- Updated dependencies [442cf7b]
  - @contentrain/skills@0.7.0

## 0.7.14

### Patch Changes

- Updated dependencies [28b6b75]
  - @contentrain/mcp@2.3.0
  - @contentrain/rules@0.6.0
  - @contentrain/skills@0.6.0

## 0.7.13

### Patch Changes

- Updated dependencies [cf6f6a8]
  - @contentrain/mcp@2.2.0
  - @contentrain/rules@0.6.0
  - @contentrain/skills@0.6.0

## 0.7.12

### Patch Changes

- Updated dependencies [c189b6f]
  - @contentrain/mcp@2.1.1
  - @contentrain/rules@0.6.0
  - @contentrain/skills@0.6.0

## 0.7.11

### Patch Changes

- Updated dependencies [dbc99fe]
  - @contentrain/mcp@2.1.0
  - @contentrain/rules@0.6.0
  - @contentrain/skills@0.6.0

## 0.7.10

### Patch Changes

- Updated dependencies [a0d5bfe]
  - @contentrain/mcp@2.0.1
  - @contentrain/rules@0.6.0
  - @contentrain/skills@0.6.0

## 0.7.9

### Patch Changes

- Updated dependencies [173326c]
  - @contentrain/mcp@2.0.0
  - @contentrain/types@0.9.0
  - @contentrain/rules@0.6.0
  - @contentrain/skills@0.6.0
  - @contentrain/query@7.0.1

## 0.7.8

### Patch Changes

- Updated dependencies [d617dab]
- Updated dependencies [d617dab]
  - @contentrain/query@7.0.0
  - @contentrain/mcp@1.11.0
  - @contentrain/rules@0.6.0
  - @contentrain/skills@0.6.0

## 0.7.7

### Patch Changes

- Updated dependencies [dca638d]
  - @contentrain/mcp@1.10.1
  - @contentrain/rules@0.6.0
  - @contentrain/skills@0.6.0

## 0.7.6

### Patch Changes

- c4bccd1: fix(cli): restore blank Serve UI labels and correct the capabilities transport badge

  The Serve UI's Doctor and Format sidebar labels rendered blank. Two causes, both fixed:

  - **Stale generated client.** The committed `#contentrain` client the UI bundles was last generated in March and had drifted 40 keys behind the source `serve-ui-texts` dictionary — including the two nav labels, the entire Doctor page copy (21 keys), the branch-detail merge-preview strings (7), and the Format page (4). Regenerating brings the client current (and also syncs the docs/marketing content the same client mirrors via `content_path`).
  - **Half-migrated sidebar.** `PrimarySidebar` used a `primary-nav.*` namespace for only Doctor/Format while the other six items were hardcoded. All eight nav items now use the single, complete `primary-sidebar.*` namespace, matching `MobileNav`'s dictionary-driven approach.

  Also: `/api/capabilities` reported `transport: "stdio"` in Web-UI mode, where the dashboard is actually reached over HTTP (the MCP engine is embedded in-process). The badge now reads `local · http`. `stdio` remains correct only for `serve --stdio`, which does not serve this UI.

## 0.7.5

### Patch Changes

- Updated dependencies [f5c70eb]
  - @contentrain/types@0.8.0
  - @contentrain/mcp@1.10.0
  - @contentrain/rules@0.6.0
  - @contentrain/skills@0.6.0
  - @contentrain/query@6.2.1

## 0.7.4

### Patch Changes

- Updated dependencies [1387ce1]
  - @contentrain/mcp@1.9.0
  - @contentrain/rules@0.5.3
  - @contentrain/skills@0.5.3

## 0.7.3

### Patch Changes

- Updated dependencies [d8caad3]
  - @contentrain/query@6.2.0

## 0.7.2

### Patch Changes

- Updated dependencies [c444561]
  - @contentrain/mcp@1.8.1
  - @contentrain/rules@0.5.3
  - @contentrain/skills@0.5.3

## 0.7.1

### Patch Changes

- Updated dependencies [f1a2dce]
- Updated dependencies [cfface5]
  - @contentrain/mcp@1.8.0
  - @contentrain/rules@0.5.3
  - @contentrain/skills@0.5.3

## 0.7.0

### Minor Changes

- ee8da2d: Delete remote cr/\* branches on merge/delete and harden merged-branch detection

  Every review-mode save pushed its `cr/*` branch to origin, but nothing ever deleted the remote copy after a merge — stale branches accumulated monotonically (one per save+merge cycle) and rendered as phantom pending reviews in Studio.

  - `mergeBranch` (and therefore `contentrain_merge`, `contentrain merge`, `contentrain diff`, the Serve UI approve endpoints, and `LocalProvider.mergeBranch`) now deletes the merged branch's remote copy — best-effort: failures surface as a `remote.warning`, never as a failed merge. **Default on**; opt out with `remoteBranchCleanup: false` in `config.json`. Note: deleting a pushed branch closes any open PR/MR on it.
  - `contentrain_branch_delete`, the Serve UI reject endpoint, `contentrain diff`'s delete action, and `LocalProvider.deleteBranch` remove the remote copy too. `contentrain_branch_delete` also supports remote-only deletion when the local ref is already gone.
  - GitHub/GitLab providers delete the source branch after a successful API merge (opt out per call with `mergeBranch(..., { removeSourceBranch: false })`).
  - Merged-branch detection (`isMerged`, `cleanupMergedBranches`, `checkBranchHealth`) now falls back to patch-id equivalence (`git cherry`) when ancestry breaks — merged branches no longer flip to "unmerged" after a base-history rewrite. Also fixes the fast-forward guard in the transaction layer, which previously never fired (`merge-base --is-ancestor` signals via exit code with empty stderr, which simple-git reports as success).
  - `contentrain_doctor` gains a "Remote branches" check (authoritative `ls-remote` count, offline-safe); `contentrain_branch_list` accepts `remote: true` for a remote view.
  - New `contentrain prune` CLI command drains already-leaked merged remote branches (`--dry-run` / `--yes` / `--json`), and `contentrain_submit` lazily prunes up to 20 merged remote leftovers per run.
  - New exports from `@contentrain/mcp/git/branch-lifecycle`: `deleteRemoteBranch`, `listRemoteCrBranches`, `pruneMergedRemoteBranches`, `isRefMerged`, `classifyMergedBranches`.

### Patch Changes

- Updated dependencies [ee8da2d]
  - @contentrain/types@0.7.0
  - @contentrain/mcp@1.7.0
  - @contentrain/query@6.1.1
  - @contentrain/rules@0.5.3
  - @contentrain/skills@0.5.3

## 0.6.0

### Minor Changes

- bcca7bd: feat(mcp): normalize media paths to absolute delivery URLs on cloud writes

  External-agent writes through MCP Cloud go straight through `planContentSave`
  rather than Studio's content-engine, so relative `media/...` references used to
  land in git verbatim. They now resolve the same way Studio's own write path
  resolves them.

  - **@contentrain/types**: `RepoProvider` gains optional `mediaBaseUrl` (the
    per-project public delivery base, project segment included) and
    `ContentrainConfig` gains optional `cdn.url`.
  - **@contentrain/mcp**: when the provider supplies `mediaBaseUrl` (cloud mode),
    `contentrain_content_save` normalizes relative `media/...` references — in
    image/video/file fields (incl. nested object/array) and markdown bodies — to
    absolute `{base}/{path}` delivery URLs before commit. Idempotent: external
    URLs (`http(s)://`, `//`, `data:`) and already-absolute URLs pass through. In
    local mode (no base) paths are kept verbatim — the OSS file model.
  - **@contentrain/query**: `generate` accepts `cdnBaseUrl` (or reads
    `config.cdn.url`) and bakes a `media()` resolver into the generated local
    client — `media('media/...') → {base}/{path}` — the local-mode counterpart of
    CDN mode's `MediaAccessor.url()`.
  - **contentrain (CLI)**: `generate --cdnBaseUrl <base>` flag.
  - **@contentrain/rules, @contentrain/skills**: document the two media storage
    models (local-file vs Studio-CDN) and the `media()` resolver.

### Patch Changes

- Updated dependencies [bcca7bd]
  - @contentrain/types@0.6.0
  - @contentrain/mcp@1.6.0
  - @contentrain/query@6.1.0
  - @contentrain/rules@0.5.3
  - @contentrain/skills@0.5.3

## 0.5.4

### Patch Changes

- Updated dependencies [8434723]
  - @contentrain/mcp@1.5.2
  - @contentrain/rules@0.5.2
  - @contentrain/skills@0.5.2

## 0.5.3

### Patch Changes

- Updated dependencies [34c9cf1]
- Updated dependencies [61dcd1a]
  - @contentrain/rules@0.5.1
  - @contentrain/skills@0.5.1
  - @contentrain/mcp@1.5.1

## 0.5.2

### Patch Changes

- 149fa6b: `contentrain init` now prints stack-aware SDK wiring guidance after setup: for bundler stacks (Nuxt/Next/Vite/etc.) it shows the `#contentrain` subpath import, points to the `contentrain-sdk` bundler-alias skill, and recommends a `prebuild`/`predev` generate step (because `.contentrain/client/` is git-ignored and must be regenerated on fresh clones / CI). Nuxt projects also get a server-only reminder.
- Updated dependencies [149fa6b]
- Updated dependencies [149fa6b]
- Updated dependencies [149fa6b]
  - @contentrain/mcp@1.5.0
  - @contentrain/types@0.5.1
  - @contentrain/query@6.0.0
  - @contentrain/rules@0.5.0
  - @contentrain/skills@0.5.0

## 0.5.1

### Patch Changes

- Updated dependencies [cc066fe]
  - @contentrain/mcp@1.4.0
  - @contentrain/rules@0.4.0
  - @contentrain/skills@0.4.0

## 0.5.0

### Minor Changes

- ec5325f: feat: serve correctness + level-ups — drift fixes, capability surface, sync warnings, secure-by-default auth

  Consolidates a four-agent review of the `contentrain serve` surface
  and the `@contentrain/mcp` helpers it consumes. Ships as a single
  cohesive PR because the drift fixes are invisible without the UI
  affordances that surface them (sync warnings UI, capability badge,
  branch health banner).

  ### MCP — new public helpers + empty-repo init

  - `branchDiff(projectRoot, { branch, base? })` in
    `@contentrain/mcp/git/branch-lifecycle`. Defaults `base` to
    `CONTENTRAIN_BRANCH` — the singleton content-tracking branch every
    feature branch forks from. Replaces the CLI's duplicated
    `git.diff([${defaultBranch}...${branch}])` calls, which surfaced
    unrelated historical content changes once `contentrain` advanced
    past the repo's default branch.
  - `contentrain_init` tool now handles greenfield directories: if the
    repo has zero commits after `git init` (or existed commit-free),
    it seeds an `--allow-empty` initial commit so
    `ensureContentBranch` has a base ref to anchor on. Previously the
    CLI `init` command created this commit manually while the MCP
    tool skipped the step — the tool failed on an empty directory
    the CLI handled fine.

  ### Serve server — correctness + new routes + auth

  - **Merge flow** — 3 duplicated merge-via-worktree implementations
    (`/api/branches/approve`, `/api/normalize/approve`, and the `diff`
    CLI command) now delegate to MCP's `mergeBranch()` helper, which
    runs the worktree transaction with selective sync + dirty-file
    protection. Skipped-file warnings are cached server-side and
    surfaced to the UI via the new `sync:warning` WebSocket event +
    `/api/branches/:name/sync-status` route. Merge conflicts
    broadcast `branch:merge-conflict` instead of silently succeeding.
  - **Branch diff** — `/api/branches/diff` delegates to the new
    `branchDiff()` helper with `CONTENTRAIN_BRANCH` as the default base.
  - **History filter** — tolerant of BOTH legacy `Merge branch
'contentrain/'` and current `Merge branch 'cr/'` commit patterns
    so post-migration history doesn't drop merges.
  - **`.catch(() => {})` error swallowing** at 3 sites replaced with
    proper propagation. Conflicts and cleanup failures no longer
    pretend to succeed.
  - **Normalize plan approve** broadcasts `branch:created` on the
    returned `git.branch` metadata (parity with content save).
  - **New `/api/capabilities` route** — provider type, transport,
    capability manifest, branch health, repo info in one call.
    Dashboard consumes this to render a capability badge.
  - **New `/api/branches/:name/sync-status`** — on-demand sync warning
    fetch for the branch detail page; 1h TTL cache in memory.
  - **New WS events** — `branch:rejected`, `branch:merge-conflict`,
    `sync:warning`.
  - **Zod input validation** on every write route via
    `serve/schemas.ts`. Catches malformed bodies with a structured 400
    error before they reach the MCP tool layer. Adds `zod` to the CLI's
    direct dependencies.
  - **Secure-by-default auth** — `contentrain serve` on a non-localhost
    interface now HARD ERRORS when no `--authToken` is set. No opt-out
    flag (OWASP Secure-by-Default). Matches industry tooling pattern
    (Postgres, helm, kubectl port-forward).

  ### Serve UI — level-ups that make the fixes visible

  - **`useWatch.ts`** — WSEvent union widened for the new event types.
  - **`project` store** — `capabilities` state + `branchHealthAlarm`
    computed + `fetchCapabilities()` action.
  - **AppLayout** — global branch-health banner (warning / blocked),
    sync-warning toasts with "View details" action deep-linking to
    the branch detail page, merge-conflict toasts with the failure
    message.
  - **DashboardPage** — capability badge (provider type · transport)
    next to the workflow + stack badges.
  - **BranchDetailPage** — sync warnings panel listing files the
    selective sync skipped, with the clear reason why the developer's
    working tree was preserved.
  - **ValidatePage** — issues are clickable when a `model` is present;
    deep-links to the content list filtered to `locale`/`id`/`slug`.

  ### CLI — delegation to MCP helpers

  - `commands/diff.ts` — both the diff summary and the merge path now
    call `branchDiff()` / `mergeBranch()` from MCP. Surfaces
    `sync.skipped[]` warnings to the user. Removes the duplicated
    `contentrain` branch + worktree + update-ref + checkout dance.
  - `commands/doctor.ts` — branch health check delegates to MCP's
    `checkBranchHealth()`. Previously filtered `contentrain/*` directly
    after the Phase 7 naming migration to `cr/*`, so the check was
    effectively a no-op.
  - `commands/validate.ts` non-interactive path — captures `tx.complete()`
    result and surfaces the branch name + workflow action in review
    mode. Previously this metadata was silently dropped.

  ### Verification

  - `pnpm -r typecheck` → 0 errors across 8 packages.
  - `oxlint` monorepo → 0 warnings across 399 files.
  - `vue-tsc --noEmit` serve-ui → 0 errors.
  - `pnpm --filter @contentrain/mcp build` + `pnpm --filter contentrain build:cli-only` → clean.
  - MCP fast suite (`tests/core tests/conformance tests/serialization-parity tests/git tests/providers tests/server tests/util`) → **443/443 green**, 2 skipped. Includes the new `setup.test.ts` empty-repo case + the new `branch-lifecycle.test.ts` `branchDiff` suite.

  ### Tool surface

  No changes. Same 16 MCP tools, same arg schemas, same response
  shapes. Stdio + LocalProvider flows behave identically to the
  previous release.

- 035e14e: feat: MCP boundary hardening + CLI command polish

  Folds the P2 "MCP entrypoint owns a private provider contract" finding
  into a single pass with CLI gap-filling — one cohesive PR because the
  new CLI commands (`merge`, `describe`, `describe-format`, `scaffold`)
  ride the very in-memory client helper that the boundary refactor
  makes safe to commit to.

  ### `@contentrain/types` — `MergeResult.sync`

  - `MergeResult` gains an optional `sync?: SyncResult` field. Remote
    providers (GitHub, GitLab) omit it; `LocalProvider` populates it
    so selective-sync bookkeeping survives the trip through the shared
    `RepoProvider.mergeBranch()` boundary.

  ### `@contentrain/mcp` — provider boundary

  - `LocalProvider` now implements the full `RepoProvider` surface:
    `listBranches`, `createBranch`, `deleteBranch`, `getBranchDiff`,
    `mergeBranch`, `isMerged`, `getDefaultBranch`. All seven wrap
    existing simple-git / transaction helpers through a new
    `providers/local/branch-ops.ts` module that mirrors the
    `providers/github/branch-ops.ts` shape.
  - `mergeBranch(branch, into)` asserts `into === CONTENTRAIN_BRANCH` —
    the local flow merges feature branches into the content-tracking
    branch and advances the base branch via `update-ref`, so arbitrary
    targets would bypass that invariant.
  - `server.ts`: the private `ToolProvider = RepoReader & RepoWriter &
{ capabilities }` alias collapses to `type ToolProvider =
RepoProvider`. Tool handlers now depend on the shared surface
    directly; the alias is kept purely so existing `ToolProvider`
    imports do not have to migrate.
  - `providers/local/types.ts` — `LocalSelectiveSyncResult` is removed
    in favour of the shared `SyncResult` from `@contentrain/types`.
    `workflowOverride` is typed with the shared `WorkflowMode` union
    instead of the duplicated `'review' | 'auto-merge'` literal.
    Matching swap inside `git/transaction.ts` so the whole write path
    speaks one union.

  ### `contentrain` — four new commands + shared MCP client

  - `utils/mcp-client.ts` — new shared `openMcpSession(projectRoot)`
    helper built on `InMemoryTransport.createLinkedPair()`. Used by
    the new commands and available for future ones that wrap MCP
    tools one-shot.
  - `contentrain merge <branch>` — scriptable single-branch sibling
    to `contentrain diff`. Delegates to the same `mergeBranch()` MCP
    helper so dirty-file protections + selective-sync warnings are
    preserved. `--yes` skips the confirmation prompt for CI use.
  - `contentrain describe <model>` — wraps `contentrain_describe`.
    Human-readable metadata + fields + stats + import snippet view,
    with `--sample`, `--locale`, `--json`.
  - `contentrain describe-format` — wraps `contentrain_describe_format`.
    Useful for humans pairing with an agent that's asked for the
    format primer.
  - `contentrain scaffold --template <id>` — wraps
    `contentrain_scaffold`. Interactive template picker when no flag
    is passed; `--locales en,tr,de`, `--no-sample`, `--json`.
  - `commands/status.ts` — branch-health thresholds (50/80) now come
    from `checkBranchHealth()` instead of being duplicated inline. The
    JSON output surfaces the full `branch_health` object so CI
    consumers see the same warning/blocked state the text mode does.

  ### Verification

  - `pnpm -r typecheck` across `@contentrain/types`,
    `@contentrain/mcp`, and `contentrain` — 0 errors.
  - `oxlint` across MCP + CLI + types src/tests — 0 warnings.
  - `@contentrain/types` vitest — 110/110.
  - `contentrain` vitest — 130/130. Includes the 11 new command tests
    (`merge`, `describe`, `scaffold`) and the updated `status` branch-
    health test against the new `checkBranchHealth()` mock.
  - New `tests/providers/local/branch-ops.test.ts` — 7/7. Covers
    contract shape, prefix-filtered branch listing, create/delete
    round-trip, diff status mapping (added/modified), post-merge
    `isMerged` flip, `mergeBranch` target guard, and config-driven
    `getDefaultBranch`.

  ### Tool surface

  No changes. Same 16 MCP tools, same arg schemas, same response
  shapes. The boundary changes are purely internal.

- 382a3a9: feat(cli): serve backend — meta watcher, watcher error broadcast, new routes, defensive Zod

  Second pass on `contentrain serve` after Phase 13's auth + drift fixes.
  Tight, surgical changes — no behaviour regressions, additive routes
  and events the Serve UI can consume immediately.

  ### File watcher coverage

  - **`.contentrain/meta/`** — the chokidar handler now recognises
    `meta/<model>/<locale>.json` and `meta/<model>/<entry>/<locale>.json`
    paths and broadcasts a `meta:changed` WebSocket event with `modelId`,
    optional `entryId`, and `locale`. Matches the two real layouts
    agents produce (per-model SEO metadata, per-entry SEO metadata).
    Without this, editing a `.contentrain/meta/*` file left the Serve
    UI rendering stale metadata until a full refresh.
  - **Watcher errors surfaced** — `chokidar.on('error', …)` was
    previously unhandled. Now broadcasts `file-watch:error` with
    `message` + ISO `timestamp`. The UI can render a "watcher down,
    live updates paused" banner instead of silently degrading (e.g.
    hitting the OS inotify limit on Linux).

  ### New HTTP routes

  - **`GET /api/describe-format`** — thin wrapper around the
    `contentrain_describe_format` MCP tool. The Serve UI can render
    this as a format-reference panel alongside the model inspector
    (what the `contentrain describe-format` CLI command shows locally).
  - **`GET /api/preview/merge?branch=cr/...`** — preview a merge
    before approving it, with zero side effects:
    - `alreadyMerged` — the feature branch is already in
      `CONTENTRAIN_BRANCH`'s history (approve would be a no-op)
    - `canFastForward` — `CONTENTRAIN_BRANCH` is an ancestor of the
      feature branch (approve will FF cleanly)
    - `conflicts` — best-effort list of conflicting paths from
      `git merge-tree`. Empty array on clean merges; `null` when the
      check can't run (older git, missing refs). Complements the
      approve route, which continues to surface runtime conflicts by
      throwing.
    - `filesChanged`, `stat` — from the shared `branchDiff()` helper
      so UI preview + actual approve see the same file list.

  ### Defensive Zod parity

  - **`/api/normalize/plan/reject`** — previously validated nothing;
    now parses an optional `{ reason? }` body through a new
    `NormalizePlanRejectBodySchema`. Both empty-body and reason-only
    requests still work (backwards compatible); malformed bodies
    return a structured 400 instead of silently succeeding. Keeps the
    entire serve write surface parsing through one `parseOrThrow()`
    gate.

  ### Explicitly out of scope

  - **`/api/doctor`** — the MCP surface has no `contentrain_doctor`
    tool yet; only the CLI's 540-line command. Proper route requires
    extracting doctor into a reusable `@contentrain/mcp` tool first,
    which is its own phase (14c candidate). Rather than duplicate
    CLI logic into serve, we defer.
  - **`sdk:regenerated` WS event** — `contentrain generate` runs
    outside serve's process, so the watcher can't observe it cleanly.
    Needs a different mechanism (e.g. a sentinel file, or integrating
    generate into serve's lifecycle). Defer until the design is
    concrete.

  ### Verification

  - `oxlint` across cli/src + cli/tests → 0 warnings on 209 files.
  - `contentrain` typecheck — 0 errors.
  - `contentrain` vitest → **137/137** (was 130 on `next-mcp`). The 7
    new tests cover: `meta:changed` with and without `entryId`,
    `file-watch:error` payload shape, `/api/describe-format` tool
    invocation, `/api/preview/merge` validation + happy path, and
    the plan/reject route's body-validation + backwards compat.

  ### Tool surface

  No MCP changes — this is pure serve-backend work on existing tools.

- 071c46f: feat(mcp,cli): phase 14c — extract doctor into a reusable MCP tool + serve route

  Pulls the 540-line `contentrain doctor` CLI command apart so the same
  health report drives three consumers: the CLI, the new
  `contentrain_doctor` MCP tool, and the Serve UI's `/api/doctor` route.

  ### `@contentrain/mcp` — new shared surface

  - **`@contentrain/mcp/core/doctor`** — `runDoctor(projectRoot,
{ usage? })` returns a structured `DoctorReport`:
    `ts
    interface DoctorReport {
      checks: Array<{ name; pass; detail; severity? }>;
      summary: { total; passed; failed; warnings };
      usage?: { unusedKeys; duplicateValues; missingLocaleKeys };
    }
    `
    Every check now carries an explicit `severity` (`error` |
    `warning` | `info`) so consumers can render pass/warn/fail
    independently instead of inferring from text. Orphan content and
    stale SDK client drop to `warning`; missing git / config /
    structure stay at `error`.
  - **`contentrain_doctor` MCP tool** — read-only, local-only (gated
    behind `localWorktree`). Arg: `{ usage?: boolean }`. Returns the
    `DoctorReport` JSON verbatim. Advertised alongside
    `contentrain_describe_format` in the tools list.

  ### `contentrain` — CLI + serve consumers

  - **CLI `contentrain doctor`** collapses to a thin pretty-printer
    over `runDoctor()`. Default (interactive) output is byte-identical
    to the old command — same check labels, same `status icon name:
detail` format, same grouped usage output. New flags: - `--json` — silent, emits the raw `DoctorReport` to stdout.
    Exits non-zero when any check fails so CI pipelines can wire
    `contentrain doctor --json` as a gate. - Interactive mode also exits non-zero now on any failure (was
    always 0 before, which meant CI never noticed).
  - **`GET /api/doctor`** — wraps the MCP tool. `?usage=true` or
    `?usage=1` opts into usage analysis. The Serve UI consumes this
    for the Doctor panel being added in phase 14d.

  ### Scope notes

  - Doctor is inherently local-filesystem work (Node version, git
    binary, mtime comparisons, orphan-dir walk, source-file scan), so
    `contentrain_doctor` is capability-gated behind `localWorktree`
    and throws a structured capability error over remote providers —
    matching `contentrain_setup`, `contentrain_scaffold`, etc.
  - No behaviour change for existing users. The CLI command still
    prints the same rows; the new JSON output and non-zero exit codes
    are additive.

  ### Verification

  - `oxlint` across mcp/cli src + tests → 0 warnings on 350 files.
  - `@contentrain/mcp` typecheck → 0 errors.
  - `contentrain` typecheck → 0 errors.
  - Unit tests:
    - `tests/core/doctor.test.ts` — 6/6 (uninitialised project,
      minimal valid project, orphan detection with warning severity,
      default-omits-usage, usage-flag-adds-3-checks, stale-SDK-mtime).
    - `tests/tools/doctor.test.ts` — 4/4 (structured report over
      fixture, `{usage: true}` opt-in, capability error on remote
      provider, tool advertised in list).
    - `tests/commands/doctor.test.ts` (CLI) — 7/7, rewritten to mock
      `runDoctor` directly. Covers `--json` output, exit-code
      semantics (failure → 1), usage detail rendering, `--usage`
      forwarding.
    - `tests/integration/serve.integration.test.ts` — 24/24 (new
      `/api/doctor` test: default, `?usage=true`, `?usage=1`).

  ### Tool surface

  - **+1 tool**: `contentrain_doctor`. All existing tools unchanged.

- 84af43c: feat(cli/serve-ui): phase 14d — consume 14b + 14c backend capabilities

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

- e234e0e: feat(cli): phase 14e — cross-cutting flags: --json, --watch, --debug

  Closes the CLI ergonomics gap identified in the 14b/14c audits. Three
  additive flags that make the CLI usable in CI, dev loops, and when
  something goes wrong internally.

  ### `--json` on `diff` and `generate`

  - `contentrain diff --json` emits a structured pending-branches
    summary and exits without entering the interactive review loop:
    ```json
    { "branches": [{ "name", "base", "filesChanged", "insertions",
                     "deletions", "stat" }] }
    ```
    Agents and CI can inspect pending `cr/*` branches without a TTY.
  - `contentrain generate --json` emits the SDK-generate result verbatim
    (`generatedFiles`, `typesCount`, `dataModulesCount`,
    `packageJsonUpdated`) so pipelines can wire generation into
    automated refresh/diff flows.
  - `contentrain doctor --json` already shipped in 14c; this completes
    the set for the most CI-relevant read commands.

  ### `--watch` on `validate`

  - `contentrain validate --watch` keeps a chokidar watcher on
    `.contentrain/content/` + `.contentrain/models/` + `config.json`
    and re-runs validation on every change (300ms debounce). Graceful
    SIGINT teardown.
  - Read-only by design — watch mode force-disables `--fix` /
    `--interactive` because those would produce a fresh `cr/fix/*`
    branch on every keystroke.
  - `--json` composes: each run prints a single-line JSON report so
    `contentrain validate --watch --json | jq` just works.

  ### `--debug` + `CONTENTRAIN_DEBUG`

  - Global `--debug` flag, stripped at the root before citty parses
    subcommands so every command's internal `debug()` / `debugTimer()`
    calls see it. Same effect from `CONTENTRAIN_DEBUG=1`.
  - New `utils/debug.ts` with `debug(context, msg)`, `debugJson(ctx,
label, value)`, and `debugTimer(ctx, label) → end()` that no-ops
    when off. All output goes to **stderr** so `--json` stdout
    payloads stay clean.
  - Wired into `validate --watch` as the first consumer; future
    commands can sprinkle it where the user-facing output isn't
    enough to diagnose a stuck op.

  ### Verification

  - `oxlint` cli src + tests → 0 warnings on 213 files.
  - `contentrain` typecheck → 0 errors.
  - New unit tests (13 added, all pass):
    - `tests/utils/debug.test.ts` — 5: default silent, `enableDebug()`
      turns on, `CONTENTRAIN_DEBUG=1` turns on at import, timer no-op,
      timer prints elapsed ms.
    - `tests/commands/diff.test.ts` — 1 new: `--json` emits structured
      branches array + skips the interactive `select()`.
    - `tests/commands/generate.test.ts` — 1 new: `--json` emits the
      generate result and suppresses pretty output.
    - `tests/commands/validate.test.ts` — 1 new: `--watch` flag is
      advertised in args.
  - Full CLI command unit suite: 38/38 pass (doctor, diff, generate,
    validate, status, merge, describe, scaffold, debug).

  No backend or tool-surface changes.

### Patch Changes

- ca54941: docs: phase R2 — align every package README with current public surface

  Each package README was cross-checked against its `src/` exports,
  `package.json` `exports` map, and (for MCP) the `TOOL_ANNOTATIONS`
  registry. Every claim in the rewritten READMEs is verified against the
  current codebase.

  ### `@contentrain/types`

  - Adds the provider-contracts section (`RepoProvider`, `RepoReader`,
    `RepoWriter`, `ProviderCapabilities`, `Commit`, `Branch`, `FileDiff`,
    `MergeResult` with optional `sync?: SyncResult`, `LOCAL_CAPABILITIES`).
  - Documents `NormalizePlan*` types, `CONTENTRAIN_BRANCH` constant,
    `SECRET_PATTERNS`, `ModelSummary`.
  - Keeps the browser-compatible validate/serialize surface described
    for Studio integration.

  ### `@contentrain/mcp`

  - Tool count corrected to **17** (was 13/16 depending on section).
    `contentrain_doctor` row added to the annotations table.
  - Subpath export list now lists every entry in `package.json`:
    `/core/doctor`, `/core/contracts`, `/core/ops`, `/core/overlay-reader`,
    `/tools/annotations`.
  - `mergeBranch` description notes the `cr/*` branch naming.
  - Capability gates section mentions doctor alongside scan/apply.

  ### `contentrain` (CLI)

  - Global `--debug` flag + `CONTENTRAIN_DEBUG` env var documented.
  - New flags table: `--json` on status/doctor/validate/generate/diff/
    describe/scaffold; `--watch` on validate/generate; `--demo` and
    `--mcpHttp` / `--authToken` on serve.
  - `setup`, `skills`, `merge`, `describe`, `describe-format`, `scaffold`
    commands added to the command table.
  - Secure-by-default HTTP transport auth described.

  ### `@contentrain/query`

  - Clarified that `contentrain generate` (CLI) is the recommended entry
    point and `contentrain-query generate` is the programmatic path.
  - Added TypeScript snippet for the programmatic `generate()` API.

  ### `@contentrain/rules`

  - `MCP_TOOLS` length corrected to **17** (includes `contentrain_merge`
    and `contentrain_doctor`).
  - New Parity section that explains how drift is prevented by
    `tests/mcp-parity.test.ts`.
  - `shared/` directory catalog added (11 rule files, previously
    undocumented).
  - Context bridge section includes the 4 stack templates.

  ### `@contentrain/skills`

  - Reference discovery pattern documented (`references/*.md` loaded on
    demand, tier table for progressive disclosure).
  - New Parity section mirroring the rules package.
  - Quick discovery snippet added to Public Exports.

  No code changes — READMEs only.

- 3cf7d19: docs(site): phase R3 — align production docs/ site with current codebase

  Every page under `docs/` (the ai.contentrain.io VitePress site) was
  audited against the current source by 5 parallel Explore agents (top-
  level, packages, reference, guides-infra, guides-content-domain), then
  applied sequentially with VitePress build verification.

  ### Tool-count corrections

  - `getting-started.md`, `concepts.md`, `packages/mcp.md`,
    `packages/cli.md`, `guides/embedding-mcp.md`,
    `guides/http-transport.md`, `guides/providers.md`,
    `guides/serve-ui.md` — every "16 tools" / "16 Contentrain tools"
    reference updated to **17** (includes `contentrain_merge` + the new
    `contentrain_doctor`).

  ### Branch-naming corrections (post Phase 7)

  - `concepts.md`, `guides/normalize.md` — legacy
    `contentrain/{operation}/...` branch prefixes rewritten to `cr/*`.
    MCP's `buildBranchName()` emits `cr/` and `checkBranchHealth` filters
    on `cr/` — docs must not teach the stale prefix.

  ### Major rewrites

  - **`packages/mcp.md`** — full tool table with 17 rows and the new
    `contentrain_doctor` in the read section. Capability gates section
    mentions doctor alongside scan/apply. Complete subpath-export list
    (adds `/core/doctor`, `/core/contracts`, `/core/ops`,
    `/core/overlay-reader`, `/tools/annotations`).
  - **`packages/cli.md`** — every command expanded with its real flags:
    `--json` on status/doctor/validate/generate/diff/describe/scaffold;
    `--watch` on validate + generate; `--fix` / `--interactive` on
    validate; global `--debug` / `CONTENTRAIN_DEBUG`; new commands
    (`merge`, `describe`, `describe-format`, `scaffold`, `setup`,
    `skills`). Serve section documents `--demo`, `--mcpHttp`, and the
    secure-by-default Bearer-token requirement on non-localhost binds.
  - **`packages/types.md`** — new Provider Contract Types section
    (`RepoProvider`, `RepoReader`, `RepoWriter`, `ProviderCapabilities`,
    `FileChange`, `ApplyPlanInput`, `Commit`, `Branch`, `FileDiff`,
    `MergeResult` with `sync?`, `SyncResult`, `CommitAuthor`), plus
    `LOCAL_CAPABILITIES` constant.
  - **`packages/rules.md`** — MCP_TOOLS length (17) and explicit
    include-checks for `contentrain_merge` and `contentrain_doctor`.
  - **`reference/providers.md`** — complete capability matrix, merge-
    result shape (including `sync?` for LocalProvider), supporting
    types, and a minimum-viable custom-provider recipe.
  - **`guides/serve-ui.md`** — new sections for every Phase 14b/c/d
    capability: `/doctor` and `/format` UI pages, merge preview on
    BranchDetail, `meta:changed` / `file-watch:error` / `sync:warning`
    / `branch:merge-conflict` / `branch:rejected` WS events, new HTTP
    routes (`/api/doctor`, `/api/describe-format`, `/api/preview/merge`,
    `/api/capabilities`, `/api/branches/:name/sync-status`), secure-by-
    default HTTP MCP auth.

  ### Minor

  - `packages/sdk.md` — generation entry point ordering: `contentrain
generate` is now presented as the recommended path; the
    programmatic `@contentrain/query/generate` API is documented for
    build-tool authors.
  - `demo.md` — code snippet gets an explicit `import { singleton }
from '#contentrain'` line for copy-paste clarity.

  ### Verified

  - `npx vitepress build` → success in 5.33s, no broken links, no
    rendering errors.
  - Every claim cross-checked against current source code.

  No code changes — docs only.

- ed87a56: docs: phase R3b — align root README / CLAUDE / AGENTS with current codebase

  Repo root guidance files updated so they agree with the per-package
  READMEs (phase R2) and the docs site (phase R3):

  ### README.md

  - Architecture diagram: `MCP (16 tools)` → `MCP (17 tools)`.
  - Feature bullet: "MCP engine — 16 tools" → "17 tools".
  - Packages table: `@contentrain/mcp` row → "17 MCP tools + ...".

  ### CLAUDE.md

  - Monorepo tree `packages/mcp` comment → `17 MCP tools`.
  - npm-packages table → `17 MCP tools`.
  - Obsolete "Octokit YOK in MCP" decision rewritten: `@octokit/rest`
    and `@gitbeaker/rest` are optional peer dependencies (Phase 5.1 + 8).

  ### AGENTS.md

  - Essentials bullet: "16 MCP tools with mandatory calling protocols"
    → 17.
  - Packages table: mcp row → "17 MCP tools — content operations engine".

  ### RELEASING.md

  - No changes — release flow docs stayed accurate through R1-R3.

  ### CONTRIBUTING.md, CLA.md, CODE_OF_CONDUCT.md

  - No changes — standards files, no code-specific content.

- e9f3104: chore(release): phase R4 — release manifest + pre-flight verification

  The 14 pending changesets collectively produce this release, verified
  with `pnpm release:status`:

  | Package               | Current | Bump  | New       |
  | --------------------- | ------- | ----- | --------- |
  | `@contentrain/mcp`    | 1.2.0   | minor | **1.3.0** |
  | `@contentrain/types`  | 0.4.x   | minor | **0.5.0** |
  | `contentrain`         | 0.4.3   | minor | **0.5.0** |
  | `@contentrain/rules`  | 0.3.x   | minor | **0.4.0** |
  | `@contentrain/skills` | 0.3.x   | minor | **0.4.0** |
  | `@contentrain/query`  | 5.1.4   | patch | **5.1.5** |

  ### Studio handoff pre-flight — satisfied

  - `@contentrain/types ≥ 0.5.0` ✓ (handoff pre-req was ≥ 0.4.2)
  - `@contentrain/mcp ≥ 1.3.0` ✓

  ### What's in this release

  **MCP:**

  - Phase 5–10 engine refactor (provider-agnostic plan/apply, Local /
    GitHub / GitLab providers, HTTP transport, capability gates).
  - Phase 13 serve correctness + secure-by-default auth.
  - Phase 14a MCP boundary hardening (`LocalProvider` implements full
    `RepoProvider`, `ToolProvider = RepoProvider`, `WorkflowMode` /
    `SyncResult` / `MergeResult.sync?` consolidation).
  - Phase 14c `contentrain_doctor` tool extraction.
  - Phase R1 parity tests — rules / skills / MCP tool registry lockstep.

  **CLI:**

  - Phase 14a new commands: `merge`, `describe`, `describe-format`,
    `scaffold`.
  - Phase 14c `doctor --json` with non-zero exit on failure.
  - Phase 14e cross-cutting flags: `--json` on diff/generate, `--watch`
    on validate, global `--debug` / `CONTENTRAIN_DEBUG`.
  - Phase 14b serve backend: `/api/describe-format`, `/api/doctor`,
    `/api/preview/merge`, `meta:changed` + `file-watch:error` WS events,
    defensive Zod on plan/reject.
  - Phase 14d Serve UI: `/doctor`, `/format` pages, merge preview panel,
    watcher-down banner, SEO metadata toast. Dictionary-first UI text.

  **Docs:**

  - Phase R2 per-package READMEs aligned with actual exports.
  - Phase R3 production docs/ site aligned with current surface (every
    claim cross-checked against source).
  - Phase R3b root README / CLAUDE / AGENTS aligned.

  ### Verification (this branch, pre-release)

  - `pnpm release:check` → passed.
  - `pnpm release:status` → 14 changesets, 5 minor + 1 patch bump.
  - `pnpm -r typecheck` → 0 errors across 8 workspace packages.
  - `pnpm lint` → 0 warnings on 419 files.

  ### Automated release flow (post-merge)

  1. R1, R2, R3, R3b, R4 PRs merge into `next-mcp`.
  2. `next-mcp` merges into `main`.
  3. Changesets action opens a "Version Packages" PR.
  4. Merging that PR publishes to npm and creates per-package tags.

  No manual `pnpm release` required — the automation handles it.

- Updated dependencies [cb8f65e]
- Updated dependencies [0c6125b]
- Updated dependencies [ec5325f]
- Updated dependencies [035e14e]
- Updated dependencies [071c46f]
- Updated dependencies [95eb6dc]
- Updated dependencies [ca54941]
- Updated dependencies [a488d49]
- Updated dependencies [cb8f65e]
  - @contentrain/mcp@1.3.0
  - @contentrain/types@0.5.0
  - @contentrain/rules@0.4.0
  - @contentrain/skills@0.4.0
  - @contentrain/query@5.1.5

## 0.4.4

### Patch Changes

- Updated dependencies [048fd78]
  - @contentrain/mcp@1.2.1

## 0.4.3

### Patch Changes

- 8af7bb9: fix(cli): resolve rules/skills packages reliably across npm, pnpm, and workspace layouts

  - Add `@contentrain/skills` as a CLI dependency so it installs transitively
  - Replace broken try/catch-around-lambda with eager `createPackageResolver()` that tests availability upfront
  - Three fallback resolution strategies: CLI bundle path, project root, direct node_modules
  - Show actionable error messages instead of generic "packages not installed"

  fix(rules): publish `shared/` directory to npm

  - Add `shared` to `files` and `exports` in package.json — 11 rule files referenced by `prompts/` were missing from published package

- Updated dependencies [8af7bb9]
  - @contentrain/rules@0.3.3

## 0.4.2

### Patch Changes

- 001e3ad: feat(cli): Add contextual Studio tips to CLI commands (init, generate, diff, status) with branding and clickable links. New setup and skills commands with IDE integration utilities.

  feat(mcp): Redesign scan pipeline with confidence scoring, deduplication, and pre-filter improvements. Add tool annotations, git transaction manager, and MCP best practices from Playwright/Engram/DBHub.

  feat(skills): Add Agent Skills ecosystem integration across all 15 skills with workflow handoff protocols, cross-references, and normalize guardrails.

  feat(rules): Add essential guardrails and shared normalize/workflow rules.

  feat(sdk): Add contentrain-query skill with bundler config references.

  fix(types): Expand shared type definitions for new scan and workflow features.

- Updated dependencies [001e3ad]
  - @contentrain/mcp@1.2.0
  - @contentrain/rules@0.3.2
  - @contentrain/query@5.1.4
  - @contentrain/types@0.4.2

## 0.4.1

### Patch Changes

- 228610f: Add contextual Contentrain Studio tips to CLI command output (init, generate, diff, status) with proper branding, colored commands, and clickable Studio link.

## 0.4.0

### Minor Changes

- 8c3e659: Add `studio connect` command that links a local repository to a Contentrain Studio project in one interactive flow — workspace selection, GitHub App installation, repo detection, `.contentrain/` scanning, and project creation. Also fixes the validate integration test timeout by batching 80 sequential git-branch spawns into a single `git update-ref --stdin` call.

## 0.3.4

### Patch Changes

- Updated dependencies [1d25752]
  - @contentrain/types@0.4.1
  - @contentrain/mcp@1.1.2
  - @contentrain/query@5.1.3

## 0.3.3

### Patch Changes

- Updated dependencies [131c752]
- Updated dependencies [131c752]
  - @contentrain/mcp@1.1.1
  - @contentrain/types@0.4.0
  - @contentrain/query@5.1.2

## 0.3.2

### Patch Changes

- fe97f7b: Rewrite git transaction system with dedicated `contentrain` branch and full worktree isolation.

  **@contentrain/mcp:**

  - Eliminate stash/checkout/merge on developer's working tree during auto-merge
  - All git operations happen in temporary worktrees — developer's tree never mutated
  - Dedicated `contentrain` branch as content state single source of truth
  - Feature branches use `cr/` prefix (avoids git ref namespace collision)
  - Auto-merge flow: feature → contentrain → update-ref baseBranch (fast-forward)
  - Selective sync: only changed files copied to working tree, dirty files skipped with warning
  - context.json committed with content (not separately)
  - Structured errors with code, message, agent_hint, developer_action
  - Automatic migration of old `contentrain/*` branches on first operation

  **@contentrain/types:**

  - Add `SyncResult` interface for selective file sync results
  - Add `ContentrainError` interface for structured error reporting
  - Add `CONTENTRAIN_BRANCH` constant

  **contentrain (CLI):**

  - Worktree merge pattern in diff, serve approve, normalize approve
  - Contentrain branch status display in `contentrain status`
  - Protected contentrain branch in branch listings

  **@contentrain/rules & @contentrain/skills:**

  - Updated workflow documentation for new git architecture

- Updated dependencies [fe97f7b]
  - @contentrain/mcp@1.1.0
  - @contentrain/types@0.3.0
  - @contentrain/rules@0.3.1
  - @contentrain/query@5.1.1

## 0.3.1

### Patch Changes

- Updated dependencies [2feb3b8]
  - @contentrain/mcp@1.0.7

## 0.3.0

### Minor Changes

- 2bf3f65: feat(rules,skills,cli): migrate to Agent Skills standard format

  **@contentrain/rules:**

  - Add `essential/contentrain-essentials.md` — compact always-loaded guardrails (~86 lines)
  - Remove `ide/` directory and `scripts/build-rules.ts` (IDE-specific build system)
  - Replace `ALL_SHARED_RULES`, `IDE_RULE_FILES` exports with `ESSENTIAL_RULES_FILE`
  - Always-loaded context reduced from 2,945 lines to 86 lines (97% reduction)

  **@contentrain/skills:**

  - Add `skills/` directory with 15 Agent Skills (SKILL.md + references/) following agentskills.io standard
  - Add `AGENT_SKILLS` catalog export for Tier 1 discovery (name + description)
  - New `contentrain-sdk` skill for @contentrain/query usage (local + CDN)
  - Existing `workflows/` and `frameworks/` kept for backward compatibility

  **contentrain (CLI):**

  - Rewrite `installRules()` with generic IDE installer supporting Claude Code, Cursor, Windsurf, and GitHub Copilot
  - Install one compact essential guardrails file per IDE (always-loaded) + Agent Skills directories (on-demand)
  - Automatic cleanup of old granular rule files from previous versions

### Patch Changes

- Updated dependencies [2bf3f65]
- Updated dependencies [2bf3f65]
  - @contentrain/rules@0.3.0
  - @contentrain/query@5.1.0

## 0.2.3

### Patch Changes

- Updated dependencies
  - @contentrain/mcp@1.0.6

## 0.2.2

### Patch Changes

- Updated dependencies
  - @contentrain/mcp@1.0.5

## 0.2.1

### Patch Changes

- feat(types): complete content architecture types — DocumentEntry, ModelSummary, path constants, validation patterns

  Internal packages updated to use centralized types from @contentrain/types.

- Updated dependencies
  - @contentrain/types@0.2.0
  - @contentrain/mcp@1.0.4
  - @contentrain/query@5.0.2

## 0.2.0

### Minor Changes

- 84eb1c2: feat(rules): add granular IDE rule files for Claude Code, Cursor, and Windsurf

  Generated individual rule files per shared rule in ide/claude-code/rules/, ide/cursor/rules/ (.mdc with alwaysApply frontmatter), and ide/windsurf/rules/ (.md with trigger: always_on frontmatter).

  feat(cli): redesign installRules() to distribute granular rules to .claude/rules/, .cursor/rules/, .windsurf/rules/

  For Claude Code: install 11 granular rule files to .claude/rules/, workflow skills to .claude/skills/ from @contentrain/skills, and add a lightweight reference to CLAUDE.md instead of the previous 2984-line monolithic bundle.

  For Cursor: install .mdc files to .cursor/rules/ when .cursor/ directory detected; fall back to monolithic .cursorrules otherwise.

  For Windsurf: install individual .md files to .windsurf/rules/ when .windsurf/ directory detected.

  fix(sdk): fix race condition in generate.test.ts that caused intermittent test failures when test files ran concurrently

### Patch Changes

- Updated dependencies [84eb1c2]
  - @contentrain/rules@0.2.0
  - @contentrain/query@5.0.1

## 0.1.4

### Patch Changes

- Add Docs and GitHub external links to serve UI sidebar.

## 0.1.3

### Patch Changes

- Fix CI pipeline: add build step before tests, configure git identity, add serve-ui to workspace, fix apply-guardrails tests.
- Updated dependencies
  - @contentrain/mcp@1.0.3

## 0.1.2

### Patch Changes

- Fix markdown document listing in serve UI: flatten frontmatter fields into table columns, include body content, and render markdown with marked + Tailwind Typography.
- Updated dependencies
  - @contentrain/mcp@1.0.2

## 0.1.1

### Patch Changes

- Updated dependencies
  - @contentrain/mcp@1.0.1
