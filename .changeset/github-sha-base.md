---
"@contentrain/mcp": minor
"@contentrain/types": patch
---

GitHub provider: `applyPlan` and `createBranch` take a full commit SHA as the base (compare-and-set writes).

A 40-hex `base` in `applyPlan` (or `fromRef` in `createBranch`) is used as it is, with no ref lookup. A missing branch forks from that commit. An existing branch must still point at it; if it has moved, the write is refused with a 409 (`PROVIDER_CONFLICT`) and nothing is written. A host that pins the commit it read no longer needs to create the branch itself before writing. Branch-name bases behave as before.
