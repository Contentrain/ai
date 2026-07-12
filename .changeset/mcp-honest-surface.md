---
"@contentrain/mcp": minor
---

feat(mcp): capability-aware tool listing, server instructions, openWorldHint, session tenant binding

**@contentrain/mcp**: the MCP surface now tells the truth about what it can do, per session.

- **Capability-aware registration.** `createServer` consults a new declarative requirement map (`TOOL_REQUIREMENTS`, exported from `@contentrain/mcp/tools/availability` together with `isToolAvailable`) and only registers tools the resolved provider + `projectRoot` pair can satisfy. Local stdio/CLI flows keep the full 19-tool surface; remote-provider sessions (Studio MCP Cloud, GitHub/GitLab providers) now list only the remote-safe subset instead of advertising tools that always failed with a capability error. Input-dependent checks (`validate --fix`, `apply` reuse) remain call-time guards.
- **`instructions` support.** `CreateServerOptions.instructions` threads the MCP `instructions` string to clients at `initialize`. Defaults to a new `DEFAULT_INSTRUCTIONS` (< 512 chars, describes the describe-format-first and dry-run-first operating rules); pass `''` to omit.
- **`openWorldHint: false`** added to all 19 tool annotations — every tool operates on the configured repository only.
- **Session tenant binding.** Multi-tenant HTTP mode accepts `sessionFingerprint(req)`: the fingerprint captured at session creation must match on every follow-up request carrying that `Mcp-Session-Id`; a mismatch answers `404 Session not found` so the client re-initializes against its own provider. Closes cross-tenant session-id replay.
