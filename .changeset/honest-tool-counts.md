---
"@contentrain/mcp": patch
"@contentrain/rules": patch
"@contentrain/skills": patch
"@contentrain/claude-plugin": patch
---

The tool count now says what a user gets: 22 MCP tools from the local `@contentrain/mcp` server, plus 5 media tools on a media-capable provider such as Studio. The earlier "27" was the registry size, and the media tools never appear on a local, GitHub or GitLab provider. `contentrain_model_save` is now annotated `destructiveHint: true`: a save replaces the whole model definition, so a field left out of the input is dropped. Clients that gate destructive tools will ask before running it.
