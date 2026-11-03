---
"@contentrain/mcp": patch
---

A remote session no longer points the agent at `contentrain_bulk`, which it does not list. The `content_save` publish_at description, its scheduling note and its publish next step name `contentrain_bulk update_status` only where bulk is registered, and otherwise say that publishing is a separate status change. The publish-state drift notice from validate names no tool; validate adds the `contentrain_bulk` restore step where bulk is listed.
