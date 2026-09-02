---
"@contentrain/types": patch
---

The generic `api_key = …` secret rule now checks what it captured before it fires (#121).

Every other pattern in `SECRET_PATTERNS` carries a provider-specific shape and is trusted on its own. The API-key rule has none — the word plus a separator was its only signal — so `api_key = your_project_api_key_here` in a setup guide was a blocking error, and once `contentrain validate` exited non-zero, a permanent CI failure for any project whose content discusses API keys. The captured tail must now look like a credential: it needs a digit, and its `_`/`-` separated tokens must not all be pure words or pure numbers. `8f14e45fceea167a…` and `AIzaSyD-9tSrke72Pou…` still fire; `your_project_api_key_here`, `xxxxxxxxxxxxxxxx` and `my_project_api_key_2024` no longer do. The rule moved out of `SECRET_PATTERNS` into `detectSecrets`; the new `looksLikeCredential` is exported.
