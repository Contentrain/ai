---
"@contentrain/types": minor
---

Grant status `capabilities` gains `media`: where the move of the files a delivery left on WordPress stands in Studio. Its states are `connected` (every file Studio takes is moved, and the new addresses are on the default branch; a file over the plan's per-file limit stays on WordPress), `pending` (being moved or not started), `review` (moved, and the address change waits for a reviewer) and `paused` (the workspace's media storage is full). Comments and forms keep `connected` and `pending`. New exports: `MIGRATE_GRANT_MEDIA_STATES`, `MigrateGrantMediaState` and `MigrateGrantCapabilities`. `validateMigrateGrantStatusResponse` is now forward-compatible on `capabilities`. A capability it does not know, or a state it does not know for one (a media state on comments or forms included), is dropped on its own and the rest are kept. Before, the whole answer was refused (`capabilities: invalid`), which now happens only when `capabilities` is not an object.
