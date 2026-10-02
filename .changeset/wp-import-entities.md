---
'@contentrain/wp-import': patch
'@contentrain/emitter-astro': patch
---

wp-import: plain-text fields (title, excerpt, a term's name and description, menu labels, media alt/caption/title, author names, the site description) decode every character reference once — named (`&hellip;`, `&rsquo;`, `&nbsp;`, … the starter's `summarize()` table), decimal and hex — instead of only decimal and `&amp;`. They were printed as `&amp;hellip;` in og:description and on list cards. `&amp;lt;` stays `&lt;`. A vocabulary key slugged from a title with such a reference changes accordingly (`&hellip;` no longer leaks `hellip` into it).

emitter-astro: the `excerpt_html` mark falls back to the escaped plain excerpt, not the raw one, so a decoded `<script>` in an excerpt prints as text; marks now also escape `"`, so a title in an attribute (`content="@@title@@"`) cannot close it.
