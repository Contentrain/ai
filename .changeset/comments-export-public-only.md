---
'@contentrain/wp-import': minor
'@contentrain/types': minor
---

The comments export carries only public discussion. `buildCommentsExport` keeps comments on published, unprotected entries that are approved (`'1'`) or pending (`'0'`, which lands in the receiving service's moderation queue). It leaves out comments on drafts, private, scheduled and password-protected entries, any other status (spam, trash, `post-trashed`, a plugin's own), and comments on entries the import does not hold. An allowlist, so it fails closed. It counts what it leaves out in the new optional `CommentsExport.excluded` (`non_public_entry`, `unknown_entry`, `spam`, `trash`, `other_status`), which `summarizeComments` passes to `HandoffComments.excluded`. `selectComments(raw)` exposes the selection.
