---
'@contentrain/types': minor
---

`ProjectPlan.behaviors` records what becomes of each behavior the Migrate fact pack found (form, search, embed, accordion, …), one `PlanBehavior` per fact id: `component`, `starter` (site search), `prose`, `drop` or `needs_review`, the last two with a `<code>: <sentence>` reason. None is dropped without a reason. `PlanModel.form` (`PlanFormConfig`, the shape Studio reads from a model's `form` key) turns a plan collection into a Studio form, with Turnstile, honeypot and notifications replacing the WordPress form plugin. Mail recipients and webhooks are never carried over. `validateProjectPlan` checks that behavior ids are unique, that components, starter features and form models resolve, that reasons are present, and that a form only exposes its model's own fields.
