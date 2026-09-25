# @contentrain/writer

Writes an Astro + Contentrain site from a migration's project plan. It runs after the import (`@contentrain/wp-import`), the media stage and the plan, and before the gates.

The writer writes programs, not data. The imported content in `.contentrain/` is copied deterministically by the earlier stages. The writer builds the site around it and never changes an entry. A model is called only for what a generator cannot express, such as a component specific to one site or a page layout no kit component covers. That model works within a fixed tool surface and a budget.

## What it does

1. **Generates** the project in place, with no model:
   - It lays the Astro starter (bundled as `starter/`) around the imported store. Existing files in `public/` (media, favicon) and the store's content and meta are left byte-identical.
   - **Models:** it merges the starter's models with the import's (the import wins; starter fields are added as optional). It seeds models the import lacks (interface strings, menus) and writes `src/content.config.ts`.
   - **Site settings from the plan:** permalink patterns, front page, posts per page, title template, site address. Redirects go into the `redirects` collection, which editors keep in Studio.
   - **Design:** the plan's design roles and the source theme's presets go into `global.css`. Roles no kit component reads are written as rules on the kit's markers, and only when the plan sets them: the heading sizes, body text, header navigation size and section padding. The site's own fonts are self-hosted from the media stage's files.
   - **Kit components** the plan places are copied in the shadcn copy model. Composed pages get a generated view per route, and every link on them resolves through the published set.
2. **Copies the source SEO:**
   - The title pattern, from the source's majority separator.
   - Hand-written titles, descriptions and noindex, into each entry's `seo` field.
   - The site name, from the facts when the store has none.
3. **Runs agent jobs** only for what step 1 could not do: site components the plan asks for, routes the generator cannot express, or repair rounds from gate failures. With `dryRun`, or when there are no jobs, no model is called.

## Use

```ts
import { localBudget, writeProject } from '@contentrain/writer'

const { report, stopped } = await writeProject(
  { plan, facts, factsDir, projectDir },
  { apiKey, budget: localBudget(15, 30 * 60_000), signal, log: console.log },
)
```

- `report` lists:
  - what was generated: files, composed views, kit components and SEO;
  - each agent job with its outcome, turns and cost;
  - tokens and dollars per model;
  - kit reuse and low-confidence placements.
- `stopped` is `'budget'` or `'time'` when the run ended early.
- A repair pass passes `feedback: GateFailure[]`. The generator does not run again; only the failures are worked on.

## Guarantees

- **Content is never written by a model.** The agent's tools write only `src/views/`, `src/components/site/` and `src/styles/site.css`. Entries and meta cannot be read, and nothing under `.contentrain/` can be written. Paths are resolved through symlinks before the check.
- **The key stays in the caller.**
  - The API key comes from `WriteContext.apiKey` and is never read from `process.env`.
  - Builds and installs run with an allowlisted environment that has no credentials in it. The Agent SDK child gets that allowlist plus the key.
- **The budget holds.**
  - Every model turn is charged to the caller's `RunBudget`.
  - Before each turn, the writer checks that the budget can pay for the whole context at the input price plus a full-length answer (`MAX_OUTPUT_TOKENS`). If not, the job stops as `stopped_budget`.
  - A job whose first turn does not fit is not started.
- **Nothing unpublished reaches the build.**
  - Menus, body links, section links, redirects, the sitemap, the feed and WordPress's query addresses all resolve through the published set.
  - A link to a draft or private page is dropped, and its text is kept.

## Models

Drafts use `claude-opus-5-5` and repairs use `claude-sonnet-5`; `WriteContext.models` overrides both. Prices for the budget are in `PRICES`. An unknown model is priced as the most expensive one.

## Development

```bash
pnpm --filter @contentrain/writer test        # no model calls
pnpm --filter @contentrain/writer typecheck
node scripts/starter-gates.mjs --fixture wp-demo   # the starter the writer lays down
```

The starter lives in `templates/astro-starter` and is copied into the package as `starter/` only when the package is packed.
