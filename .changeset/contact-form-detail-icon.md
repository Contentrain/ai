---
"@contentrain/astro-kit": minor
---

`ContactForm` details take an `iconImage`: the detail's own icon as an image file (an Elementor icon list's map marker or phone, moved as an svg), drawn before it as decoration (`alt=""`). A contact block whose address line carries a map marker keeps the marker when it moves. Before, details had no icon field, so the marker was left out (said on the receipt). A detail without an image is unchanged.
