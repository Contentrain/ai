---
"@contentrain/types": minor
---

`site.lists.prefixed` and `PlanRoute.label`: an archive's title is one heading, `Label: Name`, as WordPress prints it (`get_the_archive_title`, a block theme's `core/query-title`: "Departments: Design", "Archives: Projects"), not the label above a heading with the name. `label` is the word before the name on a custom archive route; absent, the starter's own label (category, tag, author) or none (a post type). Both optional; a plan without them is unchanged.
