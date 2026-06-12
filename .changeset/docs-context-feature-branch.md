---
"@contentrain/rules": patch
"@contentrain/skills": patch
---

Fix stale context.json documentation: the file is never committed on feature branches

Rules and skills docs still described the pre-1.x behavior ("context.json is committed together with content changes"). Since the dedicated-branch transaction flow landed, context.json is regenerated on the `contentrain` branch after merge and feature branches never carry it — parallel writes therefore cannot conflict on it. Updated workflow-rules, mcp-usage, contentrain-essentials, context-bridge, and the contentrain skill references to state the current contract.
