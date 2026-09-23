---
'@contentrain/types': minor
---

Comments export by repository path: `HandoffComments.export` (now `HandoffCommentsExport`) gains `path` — the export as a file in the generated repository, for large exports in private repositories — plus `bytes` and `sha256` for a file at `path` or `url`. `isRepoRelativePath()` accepts one normal form of repository-relative POSIX path; `commentsExportSource()` reads `path`, then `url`, then `inline`; `validateHandoffCommentsExport()` lists what is wrong with a pointer.
