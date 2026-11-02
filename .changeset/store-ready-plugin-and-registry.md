---
"@contentrain/mcp": patch
"@contentrain/claude-plugin": patch
---

Ready for the plugin and MCP directories. The MCP server now sends a title, website and icons at `initialize`, and the registry entry lists the same icons. The plugin pins the MCP server to an exact version, as the Claude plugin directory requires; every MCP release now bumps the plugin with it. The plugin logo is a square SVG without a stylesheet, which the directory's icon check accepts.
