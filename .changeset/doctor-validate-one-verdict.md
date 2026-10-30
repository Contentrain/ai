---
"@contentrain/mcp": patch
"@contentrain/types": patch
---

`contentrain_doctor` and `contentrain_validate` now give one verdict on a model. A field name that predates the snake_case rule is a notice in both: doctor's Models check no longer fails on it, and lists it as a note instead. Doctor suggests `contentrain validate --fix` only for an error that command repairs (a missing `title_field` it can infer); for any other error it names the error and points at `contentrain_model_save`. The `url` field check accepts `tel:` and `mailto:` links and `#fragment` anchors; a bare `#` (a WordPress menu parent) is a notice instead of a warning.
