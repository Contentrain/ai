---
'@contentrain/types': minor
---

Plans build a page from its page model. A `section` binding (`{ kind: 'section', model, entry?, field, props? }`) feeds a component from one object field of a page singleton, or of the route's own entry when the page model is the route's template collection. The field's keys are the component's props in snake_case (`sectionFieldName`: `ctaLabel` → `cta_label`); the view passes each one explicitly, and `props` adds fixed values. A placement names its section (`id`) and what classified it (`rule`: `<builder>:section:<id>`, `<builder>:element:<match>`, `opus` or `prose`). `PlanExtraction.field` fills one section field, and `PlanRoute.page` names the route's page model (a singleton, or a collection that is the route's source), so the entry's `body` is no longer rendered. `validateProjectPlan` checks that a section field is an object, nests objects at most 2 deep (`fieldDepth`), and that its keys are a site component's props in snake_case.
