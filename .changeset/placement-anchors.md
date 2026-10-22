---
"@contentrain/types": minor
---

A placement can carry the source's in-page link targets it holds: `PlanPlacement.anchors` (`['ddl-bluetest']` for a `href="#ddl-bluetest"`), for a section whose component takes no `id` prop (prose). The writer renders each as an element id in the section, so the carried link still lands. The validator checks a non-empty list of element ids (no whitespace), each once.
