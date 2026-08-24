---
"@contentrain/types": minor
---

Comments export contracts for migration → Studio intake: `EntrySourceMap` (WP post id → content entry address), `CommentsExport` (`contentrain-comments@1` payload with verbatim `RawComment`s and `threads_closed`), and `MigrationHandoff.comments` (`HandoffComments` summary + payload pointer). `RawComment` gains `date_gmt` and a fixed `approved` vocabulary (`'1' | '0' | 'spam' | 'trash'`, unknown values pass through).
