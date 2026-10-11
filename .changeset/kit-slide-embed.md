---
"@contentrain/astro-kit": minor
---

Slider: a slide can be a video from another site (`slides[].embed`: a YouTube, Vimeo, Loom or Wistia page, or `youtube:<id>` / `vimeo:<id>`). It is drawn as its poster with a play button and loads nothing from the provider until the reader clicks it. The player then takes the poster's box (YouTube from youtube-nocookie.com, Vimeo with dnt) and goes back to its poster when its slide is paged away. A poster on the provider's own hosts (its thumbnail) is never drawn. New `playLabel` (ui-strings `embed.play`).

Behavior islands: a link the engine writes as `<a href=watch-url data-cr-video="youtube:<id>">` (a source video player kept as a poster link) plays in place on a plain click, in an island of any kind. The player's address is built from the checked provider and id, never from the link's `href` or the attribute's text. Without JavaScript it stays a link to the video's page.

The embed address parser moves to `_shared/embed-target.ts`, and the player's iframe recipe to `_shared/embed-frame.ts`; Embed, Slider and the behaviour module share both.
