---
"@contentrain/types": minor
---

A plan section can name the fact behaviors its source element holds: `PlanPlacement.facts`, a list of planned behavior ids, each once. A writer can mark the section with them so a check on the built site finds each widget in the section that carries it. The validator rejects a duplicate id, an empty one, or one that is not a planned behavior. Absent, nothing changes.
