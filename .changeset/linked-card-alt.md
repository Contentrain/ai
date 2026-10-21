---
"@contentrain/astro-kit": patch
---

Band, CardGrid, Team and PostCard: in a card whose title link covers the card, an image whose text only repeats the title is drawn with an empty alt, so a screen reader says the title once. The content keeps its alt; an image outside such a card, or with words of its own, is drawn as written.
