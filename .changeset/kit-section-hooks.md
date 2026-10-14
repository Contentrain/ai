---
'@contentrain/astro-kit': minor
'contentrain-astro-starter': minor
---

Every section can be addressed, and quieter text keeps its contrast on every band.

- Section hooks: each section component's root carries `data-kit-section="<component id>"` (`hero`, `card-grid`, `slider`, …) and an id: the page's, or the component id counted per page (`hero`, `hero-2`). CardGrid and Behavior gain an `id` prop; CardGrid's title is now `<id>-title`. A framed Slider is its own section with the same hooks (its padding stays its own). `[data-kit-section]` still matches every section.
- Quieter text (intros, eyebrows, captions, roles, notes, footer and menu links) is a colour role instead of `opacity-75/80/85`: `--color-ink-muted` on a light band, the new `--color-ink-muted-inverse` on a dark band (the starter mixes the surface 80% toward the ink), and the fill's own ink on an accent or brand band. A card, form panel, dialog or menu inside a band goes back to `--color-ink-muted`. Opacity stays only on images, icons, disabled buttons and decorative marks. On a light band the text looks as before; on a dark or filled band it no longer falls under 4.5:1.
