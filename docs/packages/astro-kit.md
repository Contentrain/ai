---
title: Astro Kit
description: "@contentrain/astro-kit — copy-in Astro components for Contentrain sites (the shadcn model): typed props, tailwind-variants, zero JavaScript by default, with a machine-readable catalog and builder mapping tables"
order: 10
slug: astro-kit
---

# Astro Kit

Copy-in Astro components for Contentrain sites, the shadcn model. A site
receives the component source and owns it from then on, so nothing here is a
runtime dependency of the site. The package ships:

- the components;
- a machine-readable catalog;
- mapping tables from page-builder elements to components;
- a small API that copies components into a project.

```bash
pnpm add -D @contentrain/astro-kit
```

Current version: 0.50.4.

The components are made for the Astro starter (`templates/astro-starter`).
They read its design tokens and pass its gates: `astro check` with the
`strictest` preset, knip, a single stylesheet and zero JavaScript by default.

## Components

All 35 components, by role. The JavaScript column is the `js` field of each
component's catalog entry.

| id | What it is | JavaScript |
|---|---|---|
| `header`, `footer` | Site chrome: brand, navigation and an optional action; link columns, social links, copyright | none |
| `nav` | Navigation with submenus to any depth, a drawer or dropdown on narrow screens | none |
| `announcement` | A one-line notice above the header that the visitor can close | none |
| `consent` | Cookie consent bar; consent is denied until the visitor accepts | vanilla |
| `language-switcher` | Links to the same page in the site's other languages | none |
| `search-box` | A search field that sends the visitor to the site's search page | none |
| `social-links` | Links to the site's profiles on other networks | none |
| `hero` | Page opener: heading, text, actions, image | none |
| `split` | An image beside a block of text and buttons | none |
| `card-grid`, `feature-list` | A grid of cards; a list of short features | none |
| `steps` | An ordered sequence of steps | none |
| `stats` | A row of figures with a short label each; can count up once in view | vanilla |
| `logo-cloud` | Client or partner logos | none |
| `pricing` | Price plans side by side, one featured | none |
| `team` | Portrait, name, role and short bio for each person | none |
| `testimonial` | Quotes with who said them | none |
| `post-list`, `post-card` | A list of posts as cards; one post in a list | none |
| `cta`, `band` | Call-to-action band; the styled fallback section | none |
| `faq` | Questions as `<details>`, optional FAQPage JSON-LD | none |
| `contact-details` | Email, phone, address, hours and a map link, without a form | none |
| `contact-form` | A Studio form with contact details | Studio runtime |
| `newsletter` | A sign-up posting straight to the list provider | none |
| `dialog` | A modal popup the visitor opens from a button | vanilla |
| `gallery` | An image grid or masonry with a lightbox | vanilla |
| `slider` | Carousel on a scroll-snap row | Embla |
| `tabs` | Tabbed panels, readable as headed sections without JavaScript | Zag.js |
| `embed` | Video, map or player loaded on click | vanilla |
| `behavior` | A source widget no component carries, kept as the site's markup and wired by one small module | vanilla |
| `prose` | A rich-text body rendered as the editor wrote it; the fallback for unmapped elements | none |
| `pagination`, `breadcrumb` | WordPress-style `/page/N/` links; ancestors with optional JSON-LD | none |

The full list, with each component's props, variants, slots, dependencies and
accessibility notes, is in the package's `catalog.json`.

Each component lives in `components/<id>/`:

- `<Name>.astro`: the component. Its props are typed and its variants use `tailwind-variants`.
- `meta.json`: its catalog entry. Props are Contentrain `FieldDef`s, and `sources` names the builder elements the component replaces.
- `fixtures.json`: the visual-regression cases.

## API

```ts
import { copyComponents, KIT_COMPONENTS_DIR, loadCatalog, loadMapping, planCopy, rulesFor } from '@contentrain/astro-kit'

const catalog = await loadCatalog()
const plan = planCopy(catalog, ['header', 'card-grid']) // adds nav, the shared files and the npm packages needed
await copyComponents(plan, KIT_COMPONENTS_DIR, '/path/to/site') // → src/components/kit/<id>/…

const gutenberg = await loadMapping('gutenberg')
rulesFor(gutenberg, 'core/cover') // the rule that turns a cover block into a hero
```

`validateCatalog`, `componentsForSource`, `validateMapping` and
`unmappedSources` check the catalog and the mapping tables against each other.

## Mapping tables

The tables are `mapping/<builder>.json`, one each for `gutenberg`,
`elementor`, `divi` and `classic`.

- They map builder elements to components. Each prop takes its value from a small, closed set of source expressions.
- They are versioned.
- An element no rule covers stays rich text (`fallback: "prose"`).
- When several rules match an element, the outermost match owns its subtree.

## Tokens and measured style

Components use colour roles and widths, never raw values. A site defines these
tokens in `@theme`, as the starter already does:

- colours: `--color-surface`, `--color-ink`, `--color-accent`, `--color-accent-text`, …
- widths: `--container-page`, …
- shapes: `--radius-card`, …

A migration can also hand a section the style it measured on the source page
(`measured: MeasuredStyle` from `@contentrain/types`): frame width, padding,
background, item columns per breakpoint, gap, tone, radius and minimum height.
Every value is validated before it reaches a style attribute.

See the [package README](https://github.com/Contentrain/ai/tree/main/packages/astro-kit) for the complete token list and the development scripts.
