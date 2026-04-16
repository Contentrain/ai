# Conformance Fixtures

Byte-identical conformance test suite for content operations. Each fixture describes an operation and its expected on-disk file tree after execution. Used by `packages/mcp/tests/conformance.test.ts`.

**Purpose** — guarantee byte-level parity between providers (LocalProvider today; GitHubProvider + GitLabProvider in later phases) for the same operation. Any silent drift in serialization, meta generation, context.json, or path resolution shows up as a failed fixture.

## Directory layout

```
conformance/
├── README.md             — this file
├── scenarios.json        — human-readable index
├── 01-new-collection-entry/
│   ├── scenario.json     — input spec
│   ├── setup/            — files copied into temp projectRoot before op runs (optional)
│   └── expected/         — byte-identical file tree after op (GENERATED, committed)
├── 02-new-singleton/
│   └── ...
└── 03-new-dictionary/
    └── ...
```

## Scenario schema

```jsonc
{
  "id": "01-new-collection-entry",
  "description": "Save a new collection entry",
  "operation": "save_content",     // save_content | save_model | delete_content
  "context_tool": "contentrain_content_save",  // tool name recorded in context.json (optional)
  "input": {                         // operation-specific params
    "model": "blog",
    "entries": [
      { "id": "...", "locale": "en", "data": { ... } }
    ]
  }
}
```

## Determinism rules

The harness fixes non-deterministic sources so output is reproducible:

- `Date.now()` / `new Date()` returns `2026-01-01T00:00:00.000Z` (vitest fake timers)
- `CONTENTRAIN_SOURCE=mcp-local` env var is set
- `Math.random()` is NOT stubbed globally — scenarios that need determinism must pass explicit entry IDs instead of relying on `generateEntryId()`
- Git is not initialized — core write functions don't require it

## Regenerating `expected/`

When an intentional behavior change lands (e.g., schema bump, new default field), regenerate the expected fixtures and review the diff:

```bash
GENERATE_FIXTURES=1 pnpm --filter @contentrain/mcp test -- conformance
```

Then `git diff` the `expected/` directories. Each byte difference must be a conscious decision.

## Adding a new fixture

1. `mkdir NN-short-name/setup/.contentrain`
2. Write `scenario.json` at the fixture root
3. Optionally add setup files under `setup/`
4. `GENERATE_FIXTURES=1 pnpm --filter @contentrain/mcp test -- conformance` to populate `expected/`
5. Review generated `expected/` files manually — they become the contract
6. Commit both `setup/` and `expected/`

## Provider matrix (future)

Today the harness runs scenarios against the current MCP write path (direct fs + `writeContent` + `writeContext`). Post-refactor phases will add:

- Phase 2 — run through plan/apply API, assert `FileChange[]` → same `expected/`
- Phase 3 — LocalProvider.applyPlan → same `expected/`
- Phase 5 — GitHubProvider.applyPlan (mocked) → same `expected/`
- Phase 8 — GitLab/Bitbucket providers → same `expected/`

The fixtures themselves never change between providers. Only the runner wiring does.
