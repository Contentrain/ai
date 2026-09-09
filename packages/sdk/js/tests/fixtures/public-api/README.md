# Public API wire fixtures (mirror)

Byte-for-byte copies of Studio's `tests/fixtures/public-api/*.json` (PR #249,
commit `cb3abf0`), where they are produced by the real route handlers, the
real dictionary messages and the real content validator. Studio is the owner;
this directory is the consumer's copy. When Studio changes a fixture, copy it
here and fix the client — never edit a file here on its own.

Two clients are tested against these files: `FormsClient` / `CommentsClient`
in this package, and the embed runtime `@contentrain/emitter-astro` emits into
generated sites (`packages/emitter-astro/src/embed.test.ts`).

Reading rules (from Studio's README): field values travel under `data`
(forms) or as `{ author, body, parentId }` (comments); no credential is ever
sent; `success: false` + `errors[]` is a 200 verdict; 403 / 404 / 429 carry
`{ statusCode, message }` with the messages listed in `errors.json` — branch
on `field` and `statusCode`, never on message text.
