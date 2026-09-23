---
'@contentrain/query': minor
---

`ContentrainError.code` carries the API's machine code (`data.code`) from forms and comments error bodies, and `isPaymentRequired()` recognises Studio's `402 payment_required` (the workspace's billing is locked). On that error a site hides the form or thread instead of retrying or showing the owner-facing message to a visitor.
