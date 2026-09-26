---
'@contentrain/astro-kit': minor
---

Mapping tables take `sections`: rules that classify a whole page section (an Elementor container, a Gutenberg group, a Divi section) by the leaves it holds, grouped into named slots, and fill the component's props from them (`@title attr:title`, with `a || b` fallbacks). `matchSection` and `classifySection` apply them, and `validateMapping` checks them against the catalog: a slot that may hold several leaves cannot feed a `string` or `text` prop.

The catalog is the vocabulary a page model is built from. A section's props are content (stored in the page model) unless marked `content: false` (a heading level, an anchor id, an interface label). Every content prop has a Studio `label` and a `description`, a camelCase name with one capital per word, and at most two object levels. The catalog build writes each section's `contentFields` (`slides[].ctaLabel` → `slides[].cta_label`, `contentFieldName`).

List items no longer nest an image object. Card grid, gallery and slider items take `image` (the address) and `imageAlt`, testimonials `avatar` and `avatarAlt`, and slider slides `ctaLabel` and `ctaHref`. The object forms are still read until 0.7. `KitImage` looks up a missing width and height in the site's `src/lib/media.ts` (`mediaSize`, from `src/data/media-sizes.json`). The mapping tables read item images as `img:<selector>@src` and `@alt`.

Ten new components: `split` (image beside heading, markdown body and actions), `stats`, `logo-cloud`, `team`, `steps`, `pricing` (plan features as markdown), `contact-details`, `feature-list`, `announcement` (dismissible without JavaScript) and `consent`. Consent is denied by default: `<html data-consent>` stays `denied` until the visitor accepts, and the choice is announced as a `kit:consent` event, so nothing that measures runs without it. `prose` takes `markdown` as well as `html`. Section components carry a `pattern` (a summary and the signals that recognise it).

The Gutenberg, Elementor and Divi tables ship section rules for heroes (split, centred, cover), splits, card and feature rows, stats, pricing, team, testimonials, FAQs, galleries, sliders, contact forms, calls to action and announcements; the classic table maps cookie-notice plugins to `consent`. A rule's `when.root` names the section's root element (`core/cover`), a value without a slot reads that root, and `each: '@slot <selector>'` repeats over parts of a slot's leaf (an accordion's items). Elementor icon and image boxes default to centred text, as Elementor does.

The footer takes `align: center`, and a header with a tagline keeps it on one line on phones, wrapping the navigation below.
