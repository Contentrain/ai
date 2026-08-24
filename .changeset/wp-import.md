---
"@contentrain/wp-import": minor
---

New package: WordPress importers. `parseWxr` (streaming WXR → RawIR with PHP-serialized meta decoding, ACF pairing, menu/comment threading, resolution flags), `fetchRestRawIR` (public/Application-Password REST → RawIR with paginated fetch and injectable fetch), `rawToContentrain` (RawIR → canonical `.contentrain` file map + `EntrySourceMap` + import report), and `buildCommentsExport`/`summarizeComments` (`contentrain-comments@1` intake payload).
