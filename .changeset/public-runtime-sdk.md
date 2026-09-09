---
"@contentrain/query": minor
---

`FormsClient` matches Studio's public forms contract; new `CommentsClient`

The forms client had drifted from the server. It sent the values flat with a
`cf-turnstile-response` key; Studio expects `{ data, captchaToken, _hp }`. It
typed the config as a `fields` array with `captchaType`; Studio returns a
`fields` map keyed by field id (the model's `FieldDef`), `locale`, `captcha`,
`captchaSiteKey` and `honeypotField`. And it sent `Authorization: Bearer` from
the browser — the public CORS allows only `Content-Type`, so that header
failed the preflight. `FormsClient` now speaks the documented contract, takes
no API key (`FormsClientConfig.apiKey` is gone; `createContentrain().form()`
no longer passes one), resolves with the server's verdict on 2xx (including
`{ success: false, errors }`) and rejects with `ContentrainError { status,
message }` on 403/404/429/5xx, reading the h3 error body.

`CommentsClient` (`createContentrain().comments()`) is the browser side of
Studio's public `/api/comments/v1`: `thread(model, entry, { locale, page,
limit, sort })` and `submit(model, entry, { author, body, parentId,
captchaToken, honeypot }, { locale })`. Approved comments only, nested under
their roots; `body` is plain text.

Both clients are tested against JSON fixtures taken from Studio's
docs/FORMS.md and docs/COMMENTS.md examples (`tests/fixtures/public-api/`),
which the Astro emitter's embed runtime is tested against as well.
