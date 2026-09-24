---
'@contentrain/wp-import': patch
---

`fetchRestRawIR` with a credential now imports unpublished content. Post types are listed with `status=publish,future,draft,pending,private&context=edit`, and comments with two listings, approved and held. Before, the credential was sent but the listing kept WordPress's defaults, so drafts, scheduled, pending and private posts and held comments were missing. Password-protected posts are marked from the edit context. If the site refuses the credential those listings, the import falls back to the public listing with a warning. Without a credential nothing changes.
