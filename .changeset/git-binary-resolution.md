---
"@contentrain/mcp": minor
"@contentrain/types": minor
"contentrain": patch
---

Resolve the git binary once instead of re-walking PATH on every spawn

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
