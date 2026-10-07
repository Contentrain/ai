---
'@contentrain/query': patch
---

Fixes a correctness bug in the Astro loader: on large sites, content could go missing without any error when the system ran short of open file handles (file-descriptor pressure). Astro starts every collection's loader at once, and each loader used to read all of the project's models and content files in parallel. A site with about 300 models asked for some 190,000 files at the same moment, beyond what macOS allows a process to have open. Any read that failed was treated as a missing file, so a model or collection silently built short, or the build died in Astro's data-store write (EMFILE).

- The loaders of one Astro sync now read the project once and share it. The dev server still reads it fresh on each load.
- At most 64 files are read at a time, through one queue shared by every read in the process.
- Only a missing path (ENOENT/ENOTDIR) counts as absent. Any other read failure, EMFILE included, now fails the build. A file that is not valid JSON still reads as null, as before.
- When a content file that exists loads no entries, the loader logs a warning with the model name and the number of files found and read.
