---
"@contentrain/wp-import": patch
---

`strip()` also removes a tag left open at the end of a string (markup cut short, no closing `>`), so a plain-text field such as an attachment caption never keeps raw markup. Text with a less-than sign (`a < b`, `1<2`) is kept.
