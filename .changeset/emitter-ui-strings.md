---
"@contentrain/emitter-astro": minor
---

A generated site's comments and forms speak the site's language, and their text is content. Every label, button and message they show — 23 keys, the `<noscript>` notices included — is read at build time from the `ui-strings` dictionary in the site's store (`.contentrain/content/site/ui-strings/{locale}.json`) for the page's language, so it is edited in Studio or through MCP and applied by a rebuild, with no re-emit. It used to be English in the emitted code, changeable only by editing TypeScript.

Missing keys show the English default. A non-English page with no dictionary, or a dictionary missing keys, is reported once in the build log; at emit time, page languages not declared in `options.uiStrings.locales` are named in the warnings. `options.uiStrings.dir` moves the directory (project-relative; anything else is refused). `UI_STRING_DEFAULTS`, `UI_STRINGS_MODEL` and `UI_STRINGS_DIR` are exported so a producer creates exactly the dictionary the site reads. Mounted components now receive the page's `lang`.
