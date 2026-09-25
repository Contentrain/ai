---
'@contentrain/wp-import': minor
'@contentrain/types': minor
---

The comments export carries only public discussion. `buildCommentsExport` keeps comments on published, unprotected entries that are approved (`'1'`) or pending (`'0'`, which lands in the receiving service's moderation queue). It leaves out comments on drafts, private, scheduled and password-protected entries, and spam and trash, and counts them in the new optional `CommentsExport.excluded` (`non_public_entry`, `spam`, `trash`), which `summarizeComments` passes to `HandoffComments.excluded`. `selectComments(raw)` exposes the selection.
