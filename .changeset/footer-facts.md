---
"@contentrain/types": minor
"@contentrain/astro-kit": minor
---

`site.footer` (`feed`, `border`, `copyright`): the footer prints the "RSS feed" link, the border on its top side and the copyright line only where the source's footer does, as a migration reads them off its rendered footer. `copyright: false` prints no line (the cookie settings control stays); the "Powered by WordPress" credit is platform chrome and is never carried. The kit's `Footer` takes `border` and `copyright={false}`; absent, the starter's own (the link, the border on the default tone, "© year Site"). The feed file itself is always served.
