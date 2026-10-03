# @contentrain/astro-kit

## 0.23.5

### Patch Changes

- Updated dependencies [728c228]
  - @contentrain/types@1.47.0

## 0.23.4

### Patch Changes

- Updated dependencies [c580637]
  - @contentrain/types@1.46.0

## 0.23.3

### Patch Changes

- Updated dependencies [703f70b]
  - @contentrain/types@1.45.0

## 0.23.2

### Patch Changes

- Updated dependencies [97e19e3]
- Updated dependencies [472d914]
  - @contentrain/types@1.44.0

## 0.23.1

### Patch Changes

- Updated dependencies [c137f13]
  - @contentrain/types@1.43.0

## 0.23.0

### Minor Changes

- 6422dd8: The header takes what the source's header does differently, each only where it does: `Header` gains `bordered` (no line under the bar), `brandWeight` and `brandTracking` (the site name), `offsetTop`, `padTop` and `padBottom` (the space above and inside the bar). `site.chrome.header` carries them in the plan, validated (weights, letter-spacings and CSS lengths only; never `url()`); without it the starter's header is exactly as before.

### Patch Changes

- Updated dependencies [6422dd8]
- Updated dependencies [1db3d17]
  - @contentrain/types@1.42.0

## 0.22.0

### Minor Changes

- 0ca875a: Hero takes the source's own cover height and heading size. `minHeight` (a cover's height in pixels as the source sets it, `520`; a number, so a plan can bind it) and the `headingScale` variant (`theme`: the heading takes the site's size for its level, `--text-heading-1` for the page-opening hero, as the source's own `h1` does under a block theme). Unset, the layout's own heights and type scale are unchanged.

### Patch Changes

- 38ed8ed: ContactForm no longer draws a section that is left with only its heading. Until the form has a home (Studio bound, the WordPress page known, an https service address) the section stands on its introduction and details; with neither, the heading alone titled a form that was not there ("Tell us about your project" over empty space on a delivery without Studio). The section appears with its form once the form has a home.
- Updated dependencies [0fd08de]
  - @contentrain/types@1.41.0

## 0.21.1

### Patch Changes

- 2d6a6a8: Item headings no longer skip a level when a section has no heading of its own. `CardGrid`, `Steps`, `Pricing`, `Team`, `Tabs` and `FeatureList` print their item titles one level under the section heading, or at the section's level when there is none, the way `ContactForm` already did: a title-less card grid under a page's h1 now has h2 cards, not h3 (an Elementor icon-box row migrated as a grid). With a section heading nothing changes. The kit's visual run now also fails any fixture whose heading outline opens below its level or skips one.
- Updated dependencies [e8e0d46]
  - @contentrain/types@1.40.0

## 0.21.0

### Minor Changes

- 9814e48: `site.footer` (`feed`, `border`, `copyright`): the footer prints the "RSS feed" link, the border on its top side and the copyright line only where the source's footer does, as a migration reads them off its rendered footer. `copyright: false` prints no line (the cookie settings control stays); the "Powered by WordPress" credit is platform chrome and is never carried. The kit's `Footer` takes `border` and `copyright={false}`; absent, the starter's own (the link, the border on the default tone, "© year Site"). The feed file itself is always served.

### Patch Changes

- Updated dependencies [9814e48]
  - @contentrain/types@1.39.0

## 0.20.0

### Minor Changes

- 9992660: **Footer: link columns packed at the end edge.** A theme's footer is often the brand on the left and its menus in a block on the right, each column as wide as its links. The plan's `site.chrome.footerColumns` (`gap` px between the columns, links `size` px, and `narrowGap` px when the columns stay side by side below 768) now carries it, and the Footer's new `pack` (`spread` | `end`), `narrow` (`stack` | `row`), `packGap`, `packGapNarrow` and `linkSize` honour it; the starter wires `site.config.ts` to them. Absent, nothing changes: the columns share the footer's width as before.
- c28d16b: Gutenberg mapping: the centred hero (`hero.centered`, a first section of one column) takes an optional picture under its text as its image (`media` slot, `core/image`, at most one). A home hero of heading, lead, picture and button in one column was no section before: the picture was a leaf no slot claimed. The same section without a picture maps as before; a picture above the heading is not the centred hero, which prints its image under the text.

### Patch Changes

- Updated dependencies [9992660]
  - @contentrain/types@1.38.0

## 0.19.0

### Minor Changes

- 231c089: A `brand` colour role (`color-brand`, `color-brand-ink`, defaulting to the accent and its ink) and a `brand` tone on the call to action: a band the source paints in the page builder's own colour (Elementor's secondary on a call to action) can keep it while the buttons stay in the accent.
- 437c36f: **ContactForm: new `align` axis (`center` | `start`).** `center`, the default, is unchanged: the stacked column, and the details alone before a Studio form, sit centred at a reading width. `start` gives them the section's whole column from its start edge. This is how a page builder's container lays out text that sets no alignment of its own (IP-4 Elementor contact: G9 at 1280 went from .585 to .897).

### Patch Changes

- Updated dependencies [231c089]
- Updated dependencies [a45bb41]
- Updated dependencies [fb49db1]
- Updated dependencies [2d8e7c8]
  - @contentrain/types@1.37.0

## 0.18.0

### Minor Changes

- 61cf112: **Testimonial: new `frame` axis (`card` | `plain`).** `card`, the default, is unchanged. `plain` sets the quote and who said it straight on the section, across the column, with no border, padding or surface. This is how Elementor's testimonial widget draws them. The Elementor table (version 11) now picks `plain` for testimonial sections and lone testimonial widgets. On a phone, the card's padding had narrowed the quote by a sixth (IP-4 Elementor launch G9).

  **Faq:** `questionStyle: bold` now sets the question in bold. Before, its `font-bold` sat beside the summary's own arbitrary `font-weight`, and the CSS kept the heading weight.

## 0.17.0

### Minor Changes

- 32311e2: Elementor sections take the look of Elementor's own widget defaults, through variants the kit already has (Elementor table version 10). A source that kept those defaults now reads as it did:

  - **Stats:** a counter's title is 19px in Elementor, so `labelSize: lg`.
  - **Testimonial:** a testimonial's text is 1.3em in Elementor, so `quoteSize: xl`.
  - **FAQ:** accordion and toggle titles are bold at body size in Elementor, so `questionStyle: bold`.
  - **Team:** a person's role is a text-editor line at body size, so `roleStyle: plain`.
  - **Icon list:** an icon list is a vertical list at body size in Elementor. It now maps to the feature list's `style: list`, where it used to be `icon` cards with headings.

  The IP-4 Elementor golden scored these blocks under G9's 12% font-size tolerance.

  **Testimonial grid:** two quotes now share the row on a wide screen. A third column used to stand empty beside them and narrow both.

- 30da8d4: PostCard gains a `surface` variant (`card`: a rounded, shadowed card on the `--color-card` / `--shadow-card` / `--spacing-card` token roles) and a `byline` variant (`below`: the category above the title, `author / date` below it in the accent colour). Both default to the previous look.

### Patch Changes

- Updated dependencies [0ec7222]
- Updated dependencies [30da8d4]
  - @contentrain/types@1.36.0

## 0.16.0

### Minor Changes

- 3bf2df1: Cta `actionsAlign` (`inherit` | `start`, default `inherit`): in the centered layout, `start` sets the buttons at the start of the text's column under a centred heading and text — a WordPress buttons block with no justification inside a centred group. inline and stacked are unchanged; every existing Cta renders as before.

## 0.15.0

### Minor Changes

- 68090df: Right-to-left support: components use logical utilities (`ms-`/`ps-`/`start-`/`end-`/`border-s`/`text-start`) instead of left/right, the slider runs right to left on an RTL page (Embla `direction`), and pagination and slider arrows mirror under `dir="rtl"`. Left-to-right rendering is unchanged.

## 0.14.0

### Minor Changes

- 879f2bb: hero: a `width` variant for the cover layout — `full` (the default, unchanged) or `content`, the cover in the reading column as a WordPress cover block that is not alignfull sits under the page title. The gutenberg `core/cover` rule reads it off `alignfull`. An `actionsAlign` variant (`inherit` default, unchanged, or `start`) keeps the buttons at the start edge under centred text, as a WordPress buttons block with no justification sits inside a centred cover. The starter's ComposedPage takes `showTitle` on the home page too (default unchanged: off on home).

## 0.13.0

### Minor Changes

- f5dcc87: Gutenberg figures follow the source's own order. A section rule can now say which of two slots the source writes first (`when.order`). Gutenberg's stats rule now uses it: a row whose figures sit above their labels is `order: value-first`, as before, and a row whose labels come first is a new rule, `stats.columns-label-first`, that keeps the kit's default. Until now every Gutenberg figure row was `value-first`, so a site that writes the label first read out of its source's order (G-text). A row that mixes the two orders is not stats, so it never reads out of order. Mapping versions: gutenberg 7, divi 6 (divi's counter rule changed in 0.12 without a version bump).

## 0.12.1

### Patch Changes

- Updated dependencies [3bc0bd2]
  - @contentrain/types@1.35.0

## 0.12.0

### Minor Changes

- 11cf132: A section reads the way its source does: the page's text holds the source's words, in the source's order.

  - **Steps:** an item takes a `number`, the step's number as the source writes it (`01`, `Step 2`). It is shown as written in place of the list's counter, and hidden from screen readers, which already count the `<ol>`. The Gutenberg and Elementor step rules carry it, so a migrated "01" stays "01" (it used to become a counter's "1"). Without it the list counts itself, as before.
  - **Stats:** a new `order` variant, `label-first` (the default, as before) or `value-first`. `value-first` puts the figure first in the page's text: a plain list, since a `<dl>` names its term first. It is drawn the same either way, figure on top. The Gutenberg figure and Divi counter rules set `value-first`; the Elementor counter, which names itself first, keeps the default.
  - **Testimonial:** the quotation marks are drawn with CSS (`open-quote`/`close-quote`, so they follow the page's language), not written into the quote's text. A screen reader reads them once at most, and the text is the source's words. A quote the source already wrote inside marks keeps its own and gets none added.

### Patch Changes

- Updated dependencies [27f0bcf]
- Updated dependencies [8a6bacd]
- Updated dependencies [ac09d5d]
- Updated dependencies [4f2f8cb]
  - @contentrain/types@1.34.0

## 0.11.0

### Minor Changes

- ac6313e: A slot can now ask for `short: true | false`. The fact pack's `SectionLeaf.short` flag means the leaf's text is one short line: a name, a role or a label, at most 40 characters and with no line break.

  The Elementor `team.columns` rule (table version 9) now asks for it on the role. A row of square product or service photos with a title and a description is therefore no longer taken for people.

  As with `numeric`, `ordinal`, `small` and `portrait`, a flag the facts do not set reads as "no". Facts that do not flag short text will not fire the team rule.

## 0.10.0

### Minor Changes

- a76e4a4: Elementor section rules for rows of steps, plans and people.

  - `steps.columns` (a row of numbered steps: `layout: row`, `style: numbered`), `pricing.columns` (a name, a figure price, a period, a feature list and a button per column) and `team.columns` (a portrait, a name and a role per column) join the Elementor table. Each reads a heading above a row of containers as the section's intro, the same way the Gutenberg rules do.
  - A slot can ask for `portrait: true | false`: the fact pack's `SectionLeaf.portrait` flag says an image is a square-ish photo at least 200px across. The team rule asks for it, so a card grid with pictures is not taken for people. As with `numeric`, `ordinal` and `small`, a flag the facts do not set reads as "no": none of the new rules fires on facts that do not split Elementor rows or flag their leaves.
  - Elementor table version 7 → 8.

### Patch Changes

- Updated dependencies [ff6400d]
  - @contentrain/types@1.33.0

## 0.9.0

### Minor Changes

- f3551b6: Footer: optional `contact` prop (address, phone, email) printed in an `<address>` block with `tel:` and `mailto:` links; nothing is printed when it is empty.

## 0.8.1

### Patch Changes

- Updated dependencies [e4cdf7c]
  - @contentrain/types@1.32.1

## 0.8.0

### Minor Changes

- 4e403af: Gutenberg section rules for figures, plans, steps, logos and quotes, and the engine support they need.

  - `stats.columns`, `pricing.columns`, `steps.columns`, `testimonial.columns` (avatar per column) and `logo-cloud.images` join the Gutenberg table, ahead of the card grid that has the same leaves. A titled card grid inside a group is a card grid with that title.
  - Section rules with `when.repeat: 'columns'` take slots with `scope: 'intro'` for the leaves above the row (a heading and a lead line); `SectionMeta.intro` carries them. A rule without a repeat reads them as the section's first leaves, as before.
  - A slot can ask for `numeric: true | false`: the fact pack's `SectionLeaf.numeric` flag says a leaf's text is a figure (`1,200`, `99.99%`, `4 min`, `0`, `$29`). `ordinal` (a step's number: one or two digits) and `small` (a logo-sized image) work the same way. A flag the facts do not set reads as "no", so a rule that asks for one never fires on facts that predate it. Steps ask for `ordinal` — a timeline year is not a step number and the text stays — and logos for four or more `small` images.
  - `validateMapping` rejects an intro slot without a repeat and a column item that reads an intro slot.
  - Gutenberg table version 5 → 6.

## 0.7.1

### Patch Changes

- Updated dependencies [72a5d7a]
  - @contentrain/types@1.32.0

## 0.7.0

### Minor Changes

- 188d3cb: Elementor contact sections carry their details and plugin forms: the `contact-form.form` rule takes an icon list as `details` (each keeping its link) and a Contact Form 7, WPForms, Gravity Forms or Ninja Forms shortcode as the form. A detail's label is optional; details without labels render as a plain list.
- 7153a85: New layout and size variants for the sections a rebuilt page could not match. All of them are additive, and every default renders as before:

  - Hero `leadAlign: start` keeps the lead at the start edge under a centred heading.
  - FeatureList `style: list` is a one-column icon list at the body size, with titles as text.
  - Cta `layout: stacked` puts heading, text and buttons in one left-aligned column. Cta `tone: none` has no fill, and Section takes `tone: none` too.
  - Testimonial `quoteSize` (`base`, `lg`, `xl`) sets the quote size.
  - Faq `questionStyle: bold` sets the questions at the body size in bold.
  - Stats `labelSize` (`base`, `lg`) sets the figure labels.
  - Team `roleStyle: plain` shows the role as body-size text in the text colour.

  A split hero without an image now spans the whole row instead of half of it.

## 0.6.1

### Patch Changes

- 174cfb8: The Astro starter keeps measured image sizes in `src/lib/media-sizes.ts` (`MEDIA_SIZES`) instead of `src/data/media-sizes.json`. A migrated site no longer ships a JSON file under `src/` or a JSON import, which the migration's query-only check reports as content living outside `.contentrain`. `mediaSize` and `KitImage` behave as before.
- Updated dependencies [f768505]
- Updated dependencies [48772c0]
- Updated dependencies [b09023f]
  - @contentrain/types@1.31.0

## 0.6.0

### Minor Changes

- 2de1b59: contact-form follows the site's form home (`site.config.ts` `features.forms`): Studio when bound, the owner's form
  service, a mailto address or a link to the form on the WordPress site. The starter gains consent-gated analytics from the
  site settings (GA4, GTM, Plausible, Fathom, Matomo) that loads only on `data-consent="granted"` and stops, opting out and
  removing its cookies, when consent is withdrawn.
- fb84397: Mapping tables take `sections`: rules that classify a whole page section (an Elementor container, a Gutenberg group, a Divi section) by the leaves it holds, grouped into named slots, and fill the component's props from them (`@title attr:title`, with `a || b` fallbacks). `matchSection` and `classifySection` apply them, and `validateMapping` checks them against the catalog: a slot that may hold several leaves cannot feed a `string` or `text` prop.

  The catalog is the vocabulary a page model is built from. A section's props are content (stored in the page model) unless marked `content: false` (a heading level, an anchor id, an interface label). Every content prop has a Studio `label` and a `description`, a camelCase name with one capital per word, and at most two object levels. The catalog build writes each section's `contentFields` (`slides[].ctaLabel` → `slides[].cta_label`, `contentFieldName`).

  List items no longer nest an image object. Card grid, gallery and slider items take `image` (the address) and `imageAlt`, testimonials `avatar` and `avatarAlt`, and slider slides `ctaLabel` and `ctaHref`. The object forms are still read until 0.7. `KitImage` looks up a missing width and height in the site's `src/lib/media.ts` (`mediaSize`, from `src/data/media-sizes.json`). The mapping tables read item images as `img:<selector>@src` and `@alt`.

  Ten new components: `split` (image beside heading, markdown body and actions), `stats`, `logo-cloud`, `team`, `steps`, `pricing` (plan features as markdown), `contact-details`, `feature-list`, `announcement` (dismissible without JavaScript) and `consent`. Consent is denied by default: `<html data-consent>` stays `denied` until the visitor accepts, and the choice is announced as a `kit:consent` event, so nothing that measures runs without it. `prose` takes `markdown` as well as `html`. Section components carry a `pattern` (a summary and the signals that recognise it).

  The Gutenberg, Elementor and Divi tables ship section rules for heroes (split, centred, cover), splits, card and feature rows, stats, pricing, team, testimonials, FAQs, galleries, sliders, contact forms, calls to action and announcements; the classic table maps cookie-notice plugins to `consent`. A rule's `when.root` names the section's root element (`core/cover`), a value without a slot reads that root, and `each: '@slot <selector>'` repeats over parts of a slot's leaf (an accordion's items). Elementor icon and image boxes default to centred text, as Elementor does.

  The footer takes `align: center`, and a header with a tagline keeps it on one line on phones, wrapping the navigation below.

  `contact-form` gains `formHeading`, the form's own heading above the form (h3 under a section heading, else h2); the Elementor and Gutenberg contact rules read it from a second heading.

  Consent can be withdrawn as easily as it is given (GDPR 7(3)): any `[data-kit-consent-open]` element reopens the bar, and Footer's `consentLabel` renders that cookie settings button after the copyright line.

  An image's `alt` is optional (`ImageInput.alt?`, hero and split `image.alt`): empty or absent is decoration and renders `alt=""`, so a migration never has to invent text for a decorative source image.

### Patch Changes

- Updated dependencies [fb84397]
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
