---
"@contentrain/wp-import": patch
---

An ACF field the source states no type for (a Bridge export, WXR meta) becomes a media relation when every one of its non-empty values is an attachment id in the media library, and at least one is. Its value was a bare number — inferred as a string — so a team member's photo printed as the text "84". A value that is not a media id (a count that coincides with one id) keeps the field typed by its values, and a field the source does type is never retyped.
