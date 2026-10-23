# AGENTS.md

A static Astro site whose content lives in [Contentrain](https://contentrain.io). Models and entries are in
`.contentrain/`, and the site reads them only through `@contentrain/query`. This file is for coding agents (Claude Code,
Codex, Cursor and others) that open the repository. People start from `README.md`.

## Commands

```bash
pnpm install
pnpm dev     # http://localhost:4321
pnpm gates   # astro check → knip → build + search index → built-site checks; must stay green after every change
```

## Where the truth lives

Read these files, not a list in this file: they are what the site builds from.

- Models (fields, kinds, i18n): `.contentrain/models/*.json`. Locales and the store's settings: `.contentrain/config.json`.
- Entries: `.contentrain/content/` and `.contentrain/meta/`. Edit them through Contentrain (below), not by hand.
- Routes: `src/site.config.ts` and `src/lib/site-routes.ts` (the route table); the views under `src/views/`, a composed
  page's sections in `src/views/composed/index.ts`.
- Components: `src/components/` (the starter's), `src/components/site/` (this site's own, when it has any), and the kit
  components from `@contentrain/astro-kit`.
- Interface text: the `ui-strings` model, one dictionary per locale; no label is written in a component.
- How code is written here: `README.md` § Conventions (content only through the loader, tokens first, no JavaScript by
  default, interface text is content). Follow it; `pnpm gates` checks most of it.

## Editing content with Contentrain

`.mcp.json` registers the Contentrain MCP server (`npx contentrain serve --stdio`; the first use downloads the
`contentrain` CLI). Use `contentrain_status` and `contentrain_describe` for the live view of models and entries, and
its tools to add or change content and models. Writes go to the `contentrain` branch; with Contentrain Studio connected,
Studio reviews and merges the same branch. The Contentrain agent rules and skills are not installed in this repository;
`npx skills add Contentrain/ai/packages/skills` adds them.

## This site

The block below is written once, when the site is generated. It is a snapshot: the files above are the truth, and
Studio does not update this block.

<!-- contentrain-migrate:begin -->
<!-- contentrain-migrate:end -->
