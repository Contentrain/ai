---
"contentrain": minor
---

Add `studio connect` command that links a local repository to a Contentrain Studio project in one interactive flow — workspace selection, GitHub App installation, repo detection, `.contentrain/` scanning, and project creation. Also fixes the validate integration test timeout by batching 80 sequential git-branch spawns into a single `git update-ref --stdin` call.
