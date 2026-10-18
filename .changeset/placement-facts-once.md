---
"@contentrain/types": minor
---

`validateProjectPlan` names a fact behavior once per route: two sections of one route, or a section and a layout part drawn over it (header, footer, overlay), naming the same fact is an error. An empty `facts` list is an error too; leave the field out instead.
