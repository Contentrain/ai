---
'@contentrain/wp-import': patch
---

`fetchRestRawIR` returns `credential: { status, fell_back }`, so a caller can tell whether the Application Password was honoured without reading `warnings`. `status` is `none` without `auth`, `accepted` when every listing it unlocks was read with it, and `rejected` when at least one was not; `fell_back` names those listings (`posts`, `pages`, a custom type's REST base, `comments`, `comments:hold`).

A credential the site rejects outright is now found by one `users/me` request and dropped. WordPress answers a wrong Application Password with 401 on every route, public ones included, and the fallback to the public listing used to resend it, so such an import came back with no posts, no terms and no comments while its provenance said `rest_auth`. It now imports the public site, as `rest_public`. The fallback for a single refused listing is anonymous too.
