---
'@contentrain/wp-import': minor
'@contentrain/types': minor
---

ACF sub-fields of repeaters, groups and flexible layouts are typed from their stated ACF type (SCF's `_source` inside each row) by the same table as top-level fields, instead of from their values. A select or checkbox value outside the field's stated choices is left out and counted in the new `ImportReport.acf_outside_choices`.

ACF date time picker values carry the site's UTC offset for that moment, DST included (`2025-03-10T09:30:00+03:00`): `fetchRestRawIR` reads `timezone_string` and `gmt_offset` from the `/wp-json/` index into `RawIR.site.timezone` / `gmt_offset`. Without either, the value stays local and `ImportReport.acf_datetime_unzoned` counts it. `acfValue`'s third argument is now a context (`{ timeZone, gmtOffset, dropped, unzoned }`).

`src/fixtures/acf-parity.json` holds the ACF → Contentrain cases the Contentrain Bridge must map the same way.

`@contentrain/types`: `RawSite.timezone?` and `RawSite.gmt_offset?`.
