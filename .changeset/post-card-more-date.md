---
"@contentrain/astro-kit": minor
"@contentrain/types": minor
---

PostCard: `moreLabel` prints the source's own read-more words under the excerpt ("READ ARTICLE"), only on a card with a link and as words (`aria-hidden`), so the title link stays the card's one link and a click on them reaches it. `dateStyle` (`full` | `long` | `medium` | `short`, default `long`) writes the date as the source does. The excerpt is capped at 75ch, so a one-column list at 1280 keeps lines readable. Nothing else changes for a card that sets neither. The plan's `site.lists.moreLabel` (plain words, 1-40 characters) and `site.lists.dateStyle` carry them; the starter's lists pass both to every card, and absent, the cards are as before.
