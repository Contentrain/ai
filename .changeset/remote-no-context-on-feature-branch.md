---
"@contentrain/mcp": patch
---

Remote write path no longer commits `.contentrain/context.json` to feature branches

`commitThroughProvider` (used by content/model save/delete over GitHub and GitLab providers) bundled a freshly built `context.json` into every feature-branch commit. Because the file embeds `new Date()` timestamps, two parallel `cr/*` branches forked from the same `contentrain` commit always diverged on it — after the first branch merged and context was regenerated on `contentrain`, the second branch's merge hit a permanent conflict on `context.json` and stayed pending forever (silent content loss in auto-merge setups).

Remote commits now carry only the plan's own changes, matching the local transaction flow where feature branches intentionally never include `context.json`. The orchestrator that owns the merge (e.g. Studio) is responsible for regenerating `context.json` on the `contentrain` branch post-merge — `buildContextChange` is exported from `@contentrain/mcp/core/context` for that purpose.
