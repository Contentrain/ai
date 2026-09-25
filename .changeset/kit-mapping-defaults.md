---
"@contentrain/astro-kit": patch
---

Mapping tables can list attribute values a builder leaves out at their default (`defaults`, read through `attrsOf`). The Elementor table (version 5) marks `video_type: youtube` for `elementor/video`, so a YouTube video widget — which Elementor saves without `video_type` — now maps to the embed.
