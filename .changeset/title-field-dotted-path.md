---
'@contentrain/types': minor
'@contentrain/mcp': minor
'@contentrain/rules': patch
'@contentrain/skills': patch
---

`title_field` can name a field one level inside an `object` field with a dotted path, `hero.heading`. A page built from sections is a singleton whose top level holds only section objects (`hero`, `services`, …). Its title is a section's heading. Before this change, the only way to title it was a copied top-level `title` field that no page prints.

- **types:** `titleFieldTarget(fields, path)` resolves the path and says why it does not resolve (`missing`, `not-object`, `too-deep`). `titleFieldValue(data, path)` reads the title at the same path. `validateProjectPlan` accepts a dotted `title_field` and checks it on a plan singleton that declares one.
- **mcp:** `contentrain_model_save` and `contentrain_validate` accept the path. A path through an array, or more than one level deep, is refused with the reason. An optional object on the path warns like an optional field. `titleFieldOptions` lists the nested choices. Inference (`validate --fix`) never picks a nested field; it names the nested choices instead.
- **rules, skills:** the title_field guidance describes the dotted path.
