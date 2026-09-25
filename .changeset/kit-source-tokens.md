---
'@contentrain/types': minor
'@contentrain/astro-kit': minor
---

**Source theme tokens.** `PLAN_TOKEN_ROLES` adds:
- `font-weight-heading` and `font-weight-body`
- `text-body`, `leading-body` and `leading-heading`
- `radius-control` and `radius-image`
- `spacing-gutter`

Kit components read them with a fallback to their own values, so a site without them renders as before:
- headings use `--font-weight-heading`;
- buttons and form controls use `--radius-control`;
- images use `--radius-image`;
- the page frame uses `--spacing-gutter`.

**Post layout and lists.** `site.post` sets the source single template's header order, previous and next links, and the "more posts" count. `site.lists` switches the post lists between cards and full content, and can show the index heading on the front page. Both are optional; without them the starter keeps its own layout.

**Footer menus.** `site.menus.footer` can now be a list of footer menus in the source's order, at most four; an empty list means no footer menu. A single slug or `'none'`, as older plans write it, is still valid, and `footerMenusOf(site)` reads either form as a list. The kit Footer takes a column without a visible title, with `label` as its accessible name.

**Mapping.** Mapping tables gain `class:<cls>=<a>|<b>`. It picks an option from a class on the element or one of its ancestors: `*` matches within the class name, and an empty branch keeps the prop's default. It works for values and for variants. Gutenberg's outline buttons (`is-style-outline`) become the kit's `ghost` action style.
