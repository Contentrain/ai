---
'@contentrain/types': minor
---

`PLAN_TOKEN_ROLES` gains a design direction's own voice and fields: `text-display`, `text-lead`, `leading-display` and `tracking-display` (a page's opening heading above `text-heading-1`, and the lead paragraph), `case-heading` (`uppercase` where the direction draws its headings in capitals), and `color-field-1` … `color-field-4` with their `-ink` (up to four coloured grounds a section can sit on, each with the text that reads on it). `validateProjectPlan` accepts the sizes only as CSS sizes, `leading-display` only as a unitless line-height, `tracking-display` only as a letter-spacing, `case-heading` only as `uppercase` or `none`, the fields only as colours, and a field only together with its ink. Absent, nothing changes.
