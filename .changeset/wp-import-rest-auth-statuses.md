---
'@contentrain/wp-import': patch
---

`fetchRestRawIR` with a credential now imports unpublished content. Post types are listed with `status=publish,future,draft,pending,private&context=edit`, and comments with two listings, approved and held. Before, the credential was sent but the listing kept WordPress's defaults, so drafts, scheduled, pending and private posts and held comments were missing. If the site refuses the credential those listings, the import falls back to the public listing with a warning. Without a credential nothing changes.

Password-protected posts now always come in as `draft` (with `visibility: password`), on every path — WXR, REST and Bridge. Before, a protected post that WordPress had published became a `published` entry, and its body is the protected text, which nothing downstream hides: it would ship on a static site. `import-report.json` counts them in `password_protected_drafts`. The importers also stop reading the password itself: `RawPost.password` is the marker `[protected]`.
