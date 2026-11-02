---
"@contentrain/claude-plugin": patch
---

The Cursor manifests now pass Cursor's published schemas. `author` and `owner` carry an email instead of a URL, because Cursor allows only `name` and `email` there, and the plugin has a display name. `pnpm plugin:build` checks these rules.
