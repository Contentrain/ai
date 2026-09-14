---
"@contentrain/emitter-astro": minor
---

Social images carry their size and type. `EmitPost.image_meta` and `QueryPage.image_meta` (`ImageMeta`: `width`, `height`, `type`) print `og:image:width`, `og:image:height` and `og:image:type`, so a share card lays out at the right aspect on first fetch. The producer supplies the measurements — the emitter never sees the file. They are printed only beside `image`, never for a `featured` fallback (a different file), and only when true of an image: positive integer sizes and an `image/…` MIME type.
