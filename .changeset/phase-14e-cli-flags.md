---
"contentrain": minor
---

feat(cli): phase 14e — cross-cutting flags: --json, --watch, --debug

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
