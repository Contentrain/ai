---
'@contentrain/types': minor
---

Plans build a page from its singleton. A `section` binding (`{ kind: 'section', model, entry?, field }`) spreads the object field of a page singleton onto a component. A placement names its section (`id`) and what classified it (`rule`: `<builder>:section:<id>`, `opus` or `prose`). `PlanExtraction.field` fills one section field, and `PlanRoute.page` names the route's page singleton, so the entry's `body` is no longer rendered. `validateProjectPlan` checks that a section field is an object, nests objects at most 2 deep (`fieldDepth`), and that its keys are the props of a site component.
