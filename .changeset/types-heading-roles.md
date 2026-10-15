---
'@contentrain/types': minor
---

`PLAN_TOKEN_ROLES` gains `font-heading` and `tracking-heading`, the starter's heading hooks: a plan can now carry a heading face and a heading track (a design direction's display face and letter spacing). `validateProjectPlan` accepts `tracking-heading` only as a letter-spacing (`normal`, `0`, or a signed length in em, rem or px). Absent, a heading inherits its face and draws its own track, as before.
