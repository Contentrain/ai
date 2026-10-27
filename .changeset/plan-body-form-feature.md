---
"@contentrain/types": minor
---

`PLAN_STARTER_FEATURES` gains `body-form`: a form in a page's or a custom type's entry body that the starter shows under the body (the entry's `form` field). A plan behavior `{ outcome: 'starter', feature: 'body-form', model }` names the Studio form model its submissions go to. `validateProjectPlan` accepts it and still checks `model` against the plan's form models.
