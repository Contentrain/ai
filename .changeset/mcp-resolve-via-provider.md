---
"@contentrain/mcp": patch
---

`contentrain_content_list` with `resolve: true` now works on remote providers (GitHub, GitLab, Studio). It used to throw "requires local filesystem access", so an agent connected through a hosted server could read a post's relation ids but never the related entries. Relation hydration now reads the related models' entries through the provider's reader, along the same paths as the local walk.
