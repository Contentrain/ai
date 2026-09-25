---
'@contentrain/wp-import': minor
'@contentrain/types': minor
---

`fetchRestRawIR` and `rawToContentrain` carry ACF / Secure Custom Fields. Values on a post's REST `acf` key are typed by one deterministic, versioned table (`ACF_MAPPING_VERSION`): the ACF type comes from SCF's `<name>_source` where the site states it, else from the value's shape. Repeaters and groups become nested `array`/`object` fields, flexible content an `array` of rows with a required `layout`, link and Google Map fixed-shape objects, post object / relationship / taxonomy / user / gallery fields relations to the store's entries, page link the target's address when that target is public.

A `password` field is never read: not into `RawIR`, not into the store. ACF values follow their post's status, so a draft's fields land with the draft. When posts carry ACF, `gaps` contains `acf_partial` (groups outside REST, options pages and non-REST post types need the Bridge).

With an Application Password, post types are read with `context=edit`: a type that is not publicly viewable gets no address. Custom taxonomies in REST are read with their terms and linked from posts.

`@contentrain/types`: `RawAcfValue.field_key` is optional, and `type?` / `label?` carry the stated ACF type and label.
