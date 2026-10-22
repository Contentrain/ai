---
"@contentrain/astro-kit": minor
---

The classic mapping (version 9) maps `classic/embed` to the Embed: a classic theme's iframe that is no YouTube, Vimeo, map or known provider widget, and a `[video]` shortcode whose source is a YouTube or Vimeo address. `url` reads the iframe's address or the video's source (`dom:iframe, video source@src`), `title` the iframe's title. A known provider shows as a poster loaded on click; any other address stays a plain link, never framed. Embed now lists `classic/embed` in its classic sources.
