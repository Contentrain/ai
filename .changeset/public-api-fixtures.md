---
"@contentrain/query": patch
"@contentrain/emitter-astro": patch
---

Public-API fixtures are byte-for-byte copies of Studio's wire fixtures; root comments send `parentId: null`

The forms/comments fixtures had been derived from the docs examples and
carried values that never appear on the wire (dictionary keys instead of
dictionary text, a real-looking `statusMessage` where Nitro sends "Server
Error", validation messages that are the validator's free text). They are
now copies of Studio's `tests/fixtures/public-api` with Studio as the owner;
tests branch on `field` and `statusCode`, never on message text. Both the
SDK `CommentsClient` and the emitted embed runtime now send `parentId: null`
explicitly for a root comment, as Studio's own request fixture does.
