---
"@contentrain/types": minor
---

`RawIR` gains optional `hardcoded_text` (`RawHardcodedText`, `RawTextCandidate`, `RawTextOccurrence`, `TEXT_CANDIDATE_KINDS`, `TEXT_EXCLUDE_REASONS`): the interface text a WordPress site shows outside its content tables — theme templates, scripts, widgets, menus, options, Customizer mods and rendered pages.

Every piece gets one outcome: transferred to a named target (`dictionary:ui-strings`, `theme-settings.<mod>`, `site.title`, `site.description`, `content:wp-menu-items`), excluded with a reason, or, for a source that could not be read, an error. Candidates merge only when text, locale and context are all equal; keys depend on text and context only, never on file or line. Rendered text that also appears in source is excluded as `rendered-from-source` and points back at the source candidate with `related`, so the same words never land twice. The totals close, and the shape is checked against the Bridge's own output, which is committed as a fixture.
