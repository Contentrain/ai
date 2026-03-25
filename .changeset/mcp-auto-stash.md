---
"@contentrain/mcp": patch
---

fix(mcp): auto-stash dirty working tree during auto-merge

MCP's auto-merge flow no longer blocks when developers have staged or unstaged changes. Working tree is automatically stashed before checkout + merge, then restored after completion.
