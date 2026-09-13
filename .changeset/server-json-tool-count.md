---
"@contentrain/mcp": patch
---

The registry description said 24 tools; there are 27

`server.json`'s description is the line an agent client shows when it discovers
this server, and it is already published — the MCP Registry currently serves
`@contentrain/mcp@3.4.1` with "24 deterministic MCP tools over stdio and HTTP".

Of all the places last night's count drift turned up, this is the worst: it is
externally visible, it is read by exactly the audience the number is meant to
inform, and it is the one surface no documentation check looks at, because it
is JSON rather than prose.

A test now derives the count from this package's own `TOOL_NAMES` and asserts
the description states it. Counted from `TOOL_NAMES` rather than
`@contentrain/rules`'s `MCP_TOOLS`: the registry entry describes what *this*
server registers, and a test should not make the package depend on another one
to say so. Verified in both directions — putting 24 back makes it fail.

The corrected description reaches the registry on the next release, which is
how `server.json` has always been published; no manual registry write is needed.
