---
"contentrain": minor
---

Add `contentrain setup codex`, and stop overwriting shared instruction files

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
