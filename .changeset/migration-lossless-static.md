---
"@contentrain/wp-import": patch
"@contentrain/emitter-astro": patch
"@contentrain/skills": patch
---

Preserve distinct translation groups when their canonical posts share a slug. Existing non-colliding entry identities remain unchanged; colliding groups receive deterministic WP-id identities. Reject translation groups that collapse to one normalized locale instead of silently overwriting a translation.

Render parameterless collection routes directly from exactly one content entry, with an explicit build error for missing or ambiguous data. Exclude public assets and dependencies from generated Astro typechecking to prevent legacy WordPress JavaScript from exhausting the build heap.

WordPress `future` posts preserve publication intent as published metadata gated by `publish_at`. Undated scheduled posts fail import. Public consumers must honor the publication window rather than checking status alone.

The migrate skill's mapping reference carried the old `future` → `draft` answer; a parity test now runs the importer and holds the status table to what it actually writes.
