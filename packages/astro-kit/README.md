# @contentrain/astro-kit

Copy-in Astro components for Contentrain sites, the shadcn model: a site
receives the component source and owns it from then on. Nothing here is a
runtime dependency of the site. The package ships the components, a
machine-readable catalog, builder mapping tables and a small API to copy
components into a project.

The components are made for [`templates/astro-starter`](../../templates/astro-starter).
They read its design tokens and pass its gates: `astro check` with the
`strictest` preset, knip, a single stylesheet and zero JavaScript by default.

## Components

| id | What it is | JavaScript |
|---|---|---|
| `header` | Brand, navigation, optional call to action | none |
| `nav` | Inline menu with submenus; popover drawer or `<details>` on phones | none |
| `footer` | Brand, link columns or a link row, social links, copyright | none |
| `hero` | Page opener: heading, text, actions, image | none |
| `card-grid` | Grid of cards (features, services, team) | none |
| `post-card` | One post in a list | none |
| `cta` | Call-to-action band | none |
| `faq` | Questions as `<details>`, optional FAQPage JSON-LD | none |
| `tabs` | Tabbed panels; readable as headed sections without JavaScript | Zag.js |
| `testimonial` | Quotes with author and role | none |
| `gallery` | Image grid with a popover lightbox | none |
| `slider` | Carousel on a scroll-snap row | Embla |
| `contact-form` | Contentrain Studio form in a section | Studio runtime |
| `newsletter` | Sign-up posting straight to the list provider (Mailchimp, Kit, MailerLite, Brevo, Buttondown) | none |
| `embed` | Video, map or player loaded on click; a provider link until then (YouTube via nocookie) | a few lines, no dependency |
| `pagination` | WordPress-style `/page/N/` links | none |
| `breadcrumb` | Ancestors, then the current page, optional JSON-LD | none |

Each component lives in `components/<id>/`:

- `<Name>.astro`: the component. Variants use `tailwind-variants`, props are typed, and every optional prop also accepts `undefined`.
- `meta.json`: its catalog entry. Props are Contentrain `FieldDef`s with a description; the entry also lists variants, slots, JavaScript, npm dependencies, `sources` (the builder elements it replaces) and accessibility notes.
- `fixtures.json`: the visual-regression cases. Every variant option is covered.

`components/_shared/` holds `Section`, `Button`, `KitImage` and the value types
(`ImageInput`, `LinkInput`, `ActionInput`, `NavItem`).

## Tokens

Components use colour roles and widths, never raw values. A site defines them
in `@theme` (the starter already does): `--color-surface`,
`--color-surface-muted`, `--color-ink`, `--color-ink-muted`, `--color-line`,
`--color-accent`, `--color-accent-ink`, `--font-sans`, `--container-prose`,
`--container-page`, `--container-wide` and `--radius-card`.

A migrated site also carries its theme's type and shape, and components read
these with a fallback to the kit's own values, so a site without them looks
unchanged:
- `--font-weight-heading`: section headings fall back to 700, item titles to 600.
- `--font-weight-body`, `--text-body`, `--leading-body` and `--leading-heading`:
  the body and rich-text type. These are in the starter's CSS.
- `--radius-control`: buttons and form controls.
- `--radius-image`: images, which fall back to `--radius-card`.
- `--spacing-gutter`: the page frame's side padding, which falls back to 1rem
  on phones and 2rem from `md` up.

The theme's type scale and rhythm are not read by components. The site's
theme applies them to the kit's markers, and only when the site sets them:
- `--text-heading-1` to `--text-heading-3`: headings inside `main`.
- `--text-body`: `[data-kit-text]`, the lead and body paragraphs of hero, CTA
  and card grid.
- `--text-nav`: the header navigation, `[data-cr-part="nav-header"]`.
- `--text-footer`: the footer's text and links, `[data-kit-footer]` (the kit's
  own size is `text-sm`).
- `--spacing-section`: the distance between two consecutive sections; each
  `[data-kit-section]` gets half of it as vertical padding, except
  where `data-kit-spacing="none"`.
- `data-kit-brand` (the site title in Header and Footer) and `data-kit-tagline`
  (Footer) take the theme's own sizes: the title from where it sits (body in
  the header, a heading in the footer), the tagline from its preset.

The full list is in `catalog.json` under `tokens`.

## API

```ts
import { copyComponents, KIT_COMPONENTS_DIR, loadCatalog, loadMapping, planCopy, rulesFor } from '@contentrain/astro-kit'

const catalog = await loadCatalog()
const plan = planCopy(catalog, ['header', 'card-grid']) // adds nav, the shared files, and the npm packages needed
await copyComponents(plan, KIT_COMPONENTS_DIR, '/path/to/site') // → src/components/kit/<id>/…
// install plan.dependencies in the site

const gutenberg = await loadMapping('gutenberg')
rulesFor(gutenberg, 'core/cover') // → the rule that turns a cover block into a hero, with its prop sources
```

`validateCatalog`, `componentsForSource`, `validateMapping` and
`unmappedSources` check the catalog and the mapping tables against each other.

## Mapping tables

`mapping/<builder>.json` (`gutenberg`, `elementor`, `divi`, `classic`) map
builder elements to components, with a source for each prop from a small closed
set of expressions (see `src/mapping.ts`). They are versioned, and an element
no rule covers stays rich text (`fallback: "prose"`). When one rule matches an
element, the outermost match owns its subtree. `defaults` lists attribute
values a builder leaves out of its data while they are at their default
(Elementor saves no `video_type` for a YouTube video); `when.attr` and `attr:`
read through them (`attrsOf`).

## Development

```bash
pnpm --filter @contentrain/astro-kit catalog   # regenerate catalog.json from meta.json files
pnpm --filter @contentrain/astro-kit test      # catalog, mapping and starter-copy checks
node packages/astro-kit/scripts/visual.mjs --local-sdk [--only <id>] [--update]
```

`visual.mjs` copies the starter and installs every component into it. It
renders each fixture at `/kit/<id>/`, type-checking the fixtures against the
component props, then runs `astro check` and a build. Last, it compares
screenshots at 390, 768 and 1280 px with `visual/<platform>/`. The starter
carries some kit components in `src/components/kit/`, and a test keeps those
copies identical to the source here.
