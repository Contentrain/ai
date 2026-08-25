---
"@contentrain/types": minor
"@contentrain/emitter-astro": minor
---

Carry the source page's root attributes. `LayoutFamily.root_attrs` (new `RootAttrs`) holds the `<html>` and `<body>` attributes; the emitter writes them onto the generated page and fills `@@marks@@` inside attribute values (per-page classes like `postid-123`). Themes hang layout on those classes — a page with perfect content and empty root attributes loses its entire layout (measured on one corpus site: 36.4 vs 100, while another site was unaffected, so they are carried always). An explicit `lang` from the source wins over the project default.
