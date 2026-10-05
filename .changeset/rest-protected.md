---
"@contentrain/wp-import": patch
---

A post anonymous REST marks `content.protected: true` is a password-protected post (`password: '[protected]'`), not a public one. Anonymous REST sends no `password` field, so the mapping read alone left such a post public: an empty page and a list card.
