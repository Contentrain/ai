# @contentrain/astro-kit

## 0.2.0

### Minor Changes

- 3161f3c: Two new components.

  - `embed`: a video, map or player loaded on click. It shows a poster link to the provider until then, so nothing is requested from a third party before the click, and YouTube plays from youtube-nocookie.com. Only known providers are framed, matched by exact host.
  - `newsletter`: a plain form that posts straight to the list provider (Mailchimp, Kit, MailerLite, Brevo, Buttondown), with no script.

  The mapping tables route video, map and newsletter elements to them. `KitJs` gains `vanilla`, for a few lines of dependency-free script.

- 3eb5832: **Source theme tokens.** `PLAN_TOKEN_ROLES` adds:

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

  **Section width.** A placement's `width: 'content' | 'wide'` follows the source block's alignment: a block without alignment runs at the theme's contentSize, and the section background still spans the page.

  **Footer menus.** `site.menus.footer` can now be a list of footer menus in the source's order, at most four; an empty list means no footer menu. A single slug or `'none'`, as older plans write it, is still valid, and `footerMenusOf(site)` reads either form as a list. The kit Footer takes a column without a visible title, with `label` as its accessible name.

  **Mapping.** Mapping tables gain `class:<cls>=<a>|<b>`. It picks an option from a class on the element or one of its ancestors: `*` matches within the class name, and an empty branch keeps the prop's default. It works for values and for variants. Gutenberg's outline buttons (`is-style-outline`) become the kit's `ghost` action style.

### Patch Changes

- 8809e8f: Mapping tables can list attribute values a builder leaves out at their default (`defaults`, read through `attrsOf`). The Elementor table (version 5) marks `video_type: youtube` for `elementor/video`, so a YouTube video widget — which Elementor saves without `video_type` — now maps to the embed.
- Updated dependencies [3eb5832]
- Updated dependencies [36e5773]
- Updated dependencies [01c0065]
- Updated dependencies [9121e22]
  - @contentrain/types@1.25.0

## 0.1.1

### Patch Changes

- Updated dependencies [53505cd]
  - @contentrain/types@1.24.0

## 0.1.0

### Minor Changes

- 8faceff: First release: copy-in Astro components for sites built on `templates/astro-starter`, and the data that lets tools choose and fill them. Fifteen components (header, nav, footer, hero, card-grid, post-card, cta, faq, tabs, testimonial, gallery, slider, contact-form, pagination, breadcrumb), zero JavaScript by default, `catalog.json` (props as Contentrain field definitions, variants, the WordPress builder elements each one replaces), builder mapping tables for Gutenberg, Elementor, Divi and classic themes, and `planCopy` / `copyComponents` to copy a component with everything it renders into a site.

### Patch Changes

- Updated dependencies [d87121b]
- Updated dependencies [90b5049]
  - @contentrain/types@1.23.0
