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

The components are made for the Astro starter (`templates/astro-starter`).
They read its design tokens and pass its gates: `astro check` with the
`strictest` preset, knip, a single stylesheet and zero JavaScript by default.

## Components

The page sections:

| id | What it is | JavaScript |
|---|---|---|
| `header`, `nav`, `footer` | Site chrome: brand, menus with submenus, link columns, social links | none |
| `hero` | Page opener: heading, text, points, actions, image | none |
| `card-grid`, `post-card` | Grids of cards; one post in a list | none |
| `cta`, `band` | Call-to-action band; the styled fallback section | none |
| `faq` | Questions as `<details>`, optional FAQPage JSON-LD | none |
| `tabs` | Tabbed panels, readable as headed sections without JavaScript | Zag.js |
| `slider` | Carousel on a scroll-snap row | Embla |
| `testimonial`, `gallery` | Quotes; an image grid with a popover lightbox | none |
| `contact-form`, `newsletter` | A Studio form; a sign-up posting straight to the list provider | Studio runtime / none |
| `embed` | Video, map or player loaded on click | a few lines |
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
