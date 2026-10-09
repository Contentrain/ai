---
"@contentrain/wp-import": minor
"contentrain": minor
"@contentrain/skills": patch
---

WXR import leaves author and commenter e-mail addresses out of the store unless asked. `rawToContentrain(raw, { includeEmails: true })`, `buildCommentsExport(raw, map, { includeEmails: true })` and `contentrain import --include-emails` write them. Without the option the comments export carries `email: null`. Comment meta under a personal-data key (IP, user agent, e-mail, avatar URLs, every `akismet_*`) is never exported, matched by key (`COMMENT_PII_META_KEY`, the same list as Migrate's intake plus Akismet); the default matches the REST path, which never has them.

`contentrain import --auth` takes the Application Password from `CONTENTRAIN_WP_APP_PASSWORD` (with `--auth <user>`), from `CONTENTRAIN_WP_AUTH=user:password`, or from a hidden prompt. `--auth user:password` still works but prints a deprecation warning, since argv lands in shell history and process listings.
