---
"@contentrain/astro-kit": patch
---

Faq: a question whose answer is empty (no text and nothing to see once the markup is stripped) is drawn alone, in the item's style, with no `<details>`, summary or marker, so the page has no control that opens onto nothing. It is also left out of the FAQPage JSON-LD, which needs an accepted answer. `openFirst` opens the first question that has an answer.
