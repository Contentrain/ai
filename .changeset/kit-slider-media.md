---
"@contentrain/astro-kit": minor
---

Slider: a slide's image is optional. A slide with no image is drawn as a text card (title, text, link) the height of the row, so a carousel of quotes or testimonials is a slider too, and stays manageable in Studio as a slides list. The catalog's slide model has `image` not required. A slide with neither an image nor any text is still dropped. A carousel of text cards alone has its arrows under the row, either side of the dots, so they never cover a card's words. New fixture: `text-cards`.

Slider: a slide can hold a video (`video`, a file address, mp4/webm), drawn in place of the image, which becomes its poster. It loads nothing until the reader plays it (`preload="none"`), never plays by itself, keeps the browser's own controls with the caption under them (never over them), and pauses when its slide is paged away. A carousel of product clips moves as a slider. New fixture: `video-slides`.
