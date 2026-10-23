---
"@contentrain/types": minor
---

Plan locales: `PlanSite.locales` (`default`, `supported`, `prefixes`, `tags`, keyed by the content locale code) and `PlanRoute.locale` describe a multilingual site's languages. `validateProjectPlan` holds them together: the default is supported and equals `site.locale`, every supported code has one prefix and one BCP 47 tag, only the default locale may be served at the root (prefix `''`), and no two share a prefix. A route's locale is a site locale. Both fields are optional, so a single-locale plan stays valid unchanged. `CSS_LENGTH` is now exported, so a plan's producer refuses the same sizes the validator does.
