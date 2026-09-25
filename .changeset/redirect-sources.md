---
'@contentrain/types': minor
'@contentrain/wp-import': minor
---

Redirect rules carry what their source says about matching: `RawRedirect.query` (`exact` / `ignore` / `pass`, the Redirection plugin's modes), `case_insensitive` and `trailing_slash`. A rule that answers "gone" (410, 451) is a served rule with an empty `to`. `RawAttachment.link` is the attachment's own page, for its redirect. wp-import over REST reads the Redirection plugin's rules (`redirection/v1`, with a credential that may manage it) into `redirects` and `redirects_excluded`, shaped as the Bridge shapes them. It reads each attachment's page from REST and WXR. New gaps: `redirects_partial` (always over REST: Yoast Premium, Rank Math, Safe Redirect Manager and `.htaccess` are Bridge-only) and `redirects_require_auth`.
