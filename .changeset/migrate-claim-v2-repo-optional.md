---
"@contentrain/types": minor
---

Migrate-Studio claim v2: `repo` is optional. A provision request is signed before payment, when the delivery repository does not exist yet, so it carries none (a placeholder would be a false signed claim). A v2 claim that does carry a `repo` must still be valid; v1 still requires it.
