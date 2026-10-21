---
"@contentrain/wp-import": patch
---

Pages under different parents that share a slug (`/interior-redesign/faq/` and `/faq/`) keep their slug and their address: a slug is unique per type and parent, as WordPress keeps it, so no page is renamed (`faq-25`) and redirected away from its old URL. Where such pages exist, the type's slug field is unique per parent only and drops `unique` (the WP post ID stays unique); every other type, and a site whose slugs are all distinct, is unchanged. Two siblings sharing a slug are still renamed.
