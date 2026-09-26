---
'@contentrain/types': minor
---

Project plans can carry two more things the source theme prints. `site.lists.display` accepts `list`, which is cards in one column, as themes show an archive that is a single stack of posts. `site.chrome.footerAlign` (`start` or `center`) carries a footer that is one centred column. `validateProjectPlan` checks both values.

The Astro starter uses them:

- `BaseLayout` passes `chrome.footerAlign` to the kit footer.
- `ComposedPage` takes a `description` for a page whose sections hold the text, because a page singleton has no body to summarize.
- A page that has no body, no form and no composed view now fails the build instead of going live as a bare title.
- The README explains publishing: connecting a host, how changes approved in Studio reach it, and Studio's deploy hook.
