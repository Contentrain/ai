---
"@contentrain/astro-kit": minor
---

PostCard and PostList take a `timeZone` (an IANA name or a `±hh:mm` offset; absent, UTC): the date a card prints is read on the site's calendar, as WordPress prints it. The starter passes `siteConfig.timeZone`, which also places a post's `:year`/`:month`/`:day` address on the site's calendar: a post written in the evening of a UTC−n site keeps the address WordPress gave it.
