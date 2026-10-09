---
"@contentrain/types": patch
---

`validateProjectPlan` accepts a sub-directory install as `source.origin` (`https://example.com/blog`): its paths keep the prefix. An origin with a trailing slash, a query or a fragment is still refused.
