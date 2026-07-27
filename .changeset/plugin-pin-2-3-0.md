---
"@contentrain/claude-plugin": patch
---

Pin the plugin to @contentrain/mcp 2.3.0

2.3.0 maps GitHub and GitLab failures onto the structured error envelope, so
an agent driving the plugin against a remote provider gets a `code` and an
`agent_hint` telling it whether a retry is appropriate, instead of a bare
vendor string with a documentation URL.

The plugin shipped 2.2.0, which already carried the normalize data-loss fix.
This is the follow-up that brings the error handling with it.
