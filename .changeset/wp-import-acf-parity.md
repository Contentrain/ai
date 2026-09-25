---
'@contentrain/wp-import': minor
---

ACF sub-fields of repeaters, groups and flexible layouts are typed from their stated ACF type (SCF's `_source` inside each row) by the same table as top-level fields, instead of from their values. A select or checkbox value outside the field's stated choices is left out and counted in the new `ImportReport.acf_outside_choices`. `src/fixtures/acf-parity.json` holds the ACF → Contentrain cases the Contentrain Bridge must map the same way.
