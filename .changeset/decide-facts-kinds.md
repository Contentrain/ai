---
'@contentrain/decide': minor
---

Three kinds for Migrate v3's fact pack, each a closed set with a rule first: `field_type` (a varying value's field type among the options the fact pack offers, one Jev request per option set), `region_name` (what a top-level page section is), and `unmapped_element` (which astro-kit component a builder element becomes, or `prose` / `site-specific`). Without `CONTENTRAIN_JEW_API_TOKEN`, the rules answer and in-band decisions come back `unreviewed`, so the same code goes live once the token is set.
