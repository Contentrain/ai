---
'@contentrain/types': minor
'@contentrain/wp-import': minor
---

ACF Options Pages come through. `RawIR.acf_options` (`RawAcfOptionsPage[]`) carries each options page's site-wide fields from the bridge rung, shaped like a post's `acf`. `rawToContentrain` writes them to the `site` entry, typed and resolved like a post's ACF fields; a name that is a core field or sits on more than one page takes the page's slug as a prefix (ACF's default `acf-options-` left off), and a name still taken gets a counter (`_2`), listed in `ImportReport.acf_options_renamed`, so no field is dropped. `ImportReport.acf_options` lists what was written.
