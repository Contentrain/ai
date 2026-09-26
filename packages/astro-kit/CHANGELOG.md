# @contentrain/astro-kit

## 0.6.0

### Minor Changes

- 2de1b59: contact-form follows the site's form home (`site.config.ts` `features.forms`): Studio when bound, the owner's form
  service, a mailto address or a link to the form on the WordPress site. The starter gains consent-gated analytics from the
  site settings (GA4, GTM, Plausible, Fathom, Matomo) that loads only on `data-consent="granted"` and stops, opting out and
  removing its cookies, when consent is withdrawn.

### Patch Changes

- Updated dependencies [55a0d11]
  - @contentrain/types@1.30.0

## 0.5.0

### Minor Changes

- 23d1040: Footer marks its text `data-kit-footer`, so a site's theme can size it with `--text-footer` (a new plan token role); the kit's own size stays `text-sm`. Nav takes `color: 'link'`, the site's link colour at full strength, and Header's `linkNav` uses it: the narrow-screen toggle keeps the header's text colour. Header renders the site title once, with or without a tagline.

### Patch Changes

- 307be59: `Faq`'s `plain` style sets its questions at the body size (`--text-body`, 1rem without it) instead of a fixed `text-base`, as WordPress's details block does: a migrated Twenty Twenty-Five FAQ read 16px where the source shows 18.27px.
- Updated dependencies [23d1040]
  - @contentrain/types@1.29.0

## 0.4.0

### Minor Changes

- e62e002: A plan can now carry what a source theme prints around its content when the starter's own differs. `site.lists.text` sets the size of post bodies in a full list (Twenty Twenty-Five sets its query's post content to `medium`). `site.chrome` covers the header site title's size (`brand`), whether the header shows the tagline under the title (`tagline`), the footer's copyright line (`copyright`, where `{year}` is the current year), and whether list titles and the header navigation take the link colour (`titleLinks`, `navLinks`). The new `color-link` token role sets the link colour where it is not the accent (Hello Elementor's #c36 links).

  `validateProjectPlan` accepts sizes only as CSS lengths or `clamp()`/`calc()`/`min()`/`max()` of lengths, and the copyright only as plain text.

  In astro-kit, `Header` takes `tagline`, `brandSize` and `linkNav`, `PostCard` takes `linkTitle`, and `Footer`'s `copyright` reads `{year}` as the current year. The starter reads each key only when it is set: with none of them set, it renders the same HTML as before.

### Patch Changes

- Updated dependencies [e62e002]
  - @contentrain/types@1.28.0

## 0.3.1

### Patch Changes

- 9d8eaf7: The site title in Header and Footer now carries `data-kit-brand`, and the Footer tagline carries `data-kit-tagline`. A migrated site's theme uses these markers to size them the way the source theme did. Nothing changes until a site sets those sizes.
- Updated dependencies [3e6512c]
- Updated dependencies [64966a9]
- Updated dependencies [383d7ae]
  - @contentrain/types@1.27.0

## 0.3.0

### Minor Changes

- 7ba9de5: `KitImage` optimizes images from both places a site's media lives: raster files under `public/` (read at build time through a lazy glob, only the ones a page shows) and a media host the site allows in `image.remotePatterns` (the starter allows its Contentrain Studio project's `/api/cdn/v1/<project>/media/**`). Both get a `srcset` of widths up to the image's own. A vector, a host the site does not allow or a remote image of unknown size stays a plain `<img>`: nothing is fetched from a host the site did not name.
- 951af8c: **Type scale and section rhythm.** `PLAN_TOKEN_ROLES` adds `text-nav`, `text-heading-1`, `text-heading-2`, `text-heading-3` and `spacing-section`. Components do not read them. The site's theme applies them to the kit's markers, and only when the site sets them:

  - `data-kit-section` and `data-kit-spacing` on every section;
  - `data-kit-text` on the lead and body paragraphs of hero, CTA and card grid.

  **Plain FAQ.** Faq gains `style: 'plain'`, the browser's own disclosure triangle with no rules or boxes. Gutenberg's `core/details` now maps to it.

  **Cover alignment.** Gutenberg covers now choose the Hero's `align`: `start` when WordPress positions the content on the left (`is-position-*-left`), `center` otherwise, which is WordPress's default.

### Patch Changes

- fc3e4f4: `KitImage` no longer fails a page's build on an image path with a malformed percent escape. Such an image stays a plain `<img>`.
- Updated dependencies [334852f]
- Updated dependencies [951af8c]
- Updated dependencies [2578366]
  - @contentrain/types@1.26.0

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
