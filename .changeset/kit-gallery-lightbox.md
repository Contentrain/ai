---
'@contentrain/astro-kit': minor
---

Gallery `open: 'lightbox'`: each tile links to its large file (`full`, else the image), and with script a click opens one modal viewer for the whole set, with previous / next buttons, ←/→ (mirrored right to left), Home and End, a counter ("2 of 5") and the caption, announced as they change. Escape or a click outside the image closes it and focus returns to the tile. Labels come from props (`prevLabel`, `nextLabel`, `ofLabel`, with the existing `closeLabel`, `enlargeLabel`, `regionLabel`). Nothing animates. The viewer and its script are printed only for this option: the other modes render as before.
