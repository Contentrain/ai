---
"@contentrain/types": patch
---

Republish as 1.0.1 — 1.0.0 is permanently unavailable on npm

`@contentrain/types@1.0.0` was published on 2025-01-04 and later unpublished.
npm reserves an unpublished version number forever, so when the release
sequence reached 1.0.0 again the registry refused it:

    npm error 400 — Cannot publish over previously published version "1.0.0"

Five of the six packages in that release published successfully; only types
failed. But `workspace:*` resolves to an exact version at publish time, so
`@contentrain/mcp@3.0.0`, `@contentrain/query@7.0.2` and `contentrain@0.9.0`
all went out pinned to `@contentrain/types@1.0.0` — a version that does not
exist and cannot be created. Installing any of them fails with ETARGET.

This bumps types to 1.0.1 and carries the three dependents with it. Nothing
about the code changes; 1.0.0 never reached anyone.

Worth noting for later: had the workspace used `workspace:^` rather than
`workspace:*`, the published range would have been `^1.0.0` and this would
have healed itself the moment 1.0.1 landed, without needing to republish the
dependents.
