---
"@contentrain/mcp": patch
---

Server instructions name only tools the session registers: a session without a `projectRoot` (Studio's `/api/mcp/remote`) is no longer told to preview `contentrain_apply`, which it never lists. `defaultInstructions(available)` is exported, and the HTTP entries (`startHttpMcpServer`, `startHttpMcpServerWith`) accept `instructions`. `server.json` lists Studio's OAuth remote (`https://studio.contentrain.io/api/mcp/remote`) ahead of the API-key MCP Cloud endpoint.
