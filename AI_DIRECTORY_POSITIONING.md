# AI Directory Positioning — single source for both listings

Positioning spine and paste-ready listing copy for Contentrain's two
AI-ecosystem listings. **Both tracks derive from this file** — do not write
listing copy anywhere else.

Decided 2026-07-27. Category list re-verify against the portal's own
vocabulary before submitting.

> **Why this file lives at the repo root.** It is the single source for copy
> owned by two different repos, so it has to sit in the public one
> (`Contentrain/ai`, MIT) and be readable from `Contentrain/studio` by URL.
> It is deliberately **not** under `docs/` — the VitePress build walks every
> `.md` in that tree and also concatenates it into `/llms-full.txt`, which
> would publish this file's internal reasoning. Root-level process docs
> (`RELEASING.md`, `CONTRIBUTING.md`) are the established precedent here.
> `.internal/` is gitignored and would lose the file, which is how the
> earlier drafts were lost.

> **Two directories, two repos.** The Claude **plugin** listing is owned by
> `Contentrain/ai` (public, MIT — no plan gate). The **Connectors Directory**
> listing is owned by `Contentrain/studio` (Team/Enterprise org required).
> See `docs/REMOTE_MCP_SUBMISSION.md` in that repo for the connector runbook.

## The spine

> **Product content shouldn't be hardcoded in source — it should be typed,
> reviewed, and in Git. Whether a person or an agent wrote it.**

Everything below is an entry point to this one promise, not a separate pitch.

The spine centers the **artifact**, not the author, and that is deliberate.
Legacy hardcoded strings were written by people over years; AI-written copy is
the new inflow. They are the same governance problem at different moments, and
the same machinery solves both — so the spine has to cover both or the two
listings drift apart. Extraction is the **acquisition** story (searched,
urgent, provable in a demo); governing what an agent writes is the
**expansion** story (why you keep it). An earlier draft led with the AI angle
alone, which the plugin copy then contradicted in its own first paragraph.

## Locked decisions

| | Value |
|---|---|
| Name (both listings) | `Contentrain` |
| **Slug (permanent)** | `contentrain` |
| Connector categories | **Developer Tools** (primary) + **CMS & Web** (secondary) — two signals, no dilution |
| Tagline strategy | **Split by entry point, one spine** |

### Taglines (55 char limit)

- **Plugin** — Claude Code, no account, sells the *entry*:
  `Turn hardcoded strings into governed content` (44)
- **Connector** — Claude.ai, Studio account, sells the *operation*:
  `Edit your Git-backed product content, safely` (44)

The plugin user's moment is "my agent hardcoded 400 strings and I have no
i18n path." The connector user's moment is "let my AI client edit our content
safely." Same product, different door.

## Why not "CMS"

The directory holds ~440–840 connectors. Leading with CMS puts Contentrain
next to Contentful, Sanity, and Strapi — a brand-size fight it loses. The
site's own line is the right instinct: *"most teams do not wake up needing a
CMS."* "Hardcoded strings → governed content" is a category of one.

**Never say, in a tagline:** "headless CMS" (loses the brand-size fight),
"AI content generation" (Anthropic rejects AI media generation, and the
differentiator is the opposite — governing what AI writes), "MCP server"
(plumbing, not a promise).

**"Governance" is strong in the description, weak in a tagline.** Directory
browsing is low-context; the words that land are concrete: *hardcoded, Git,
locale, review, typed, validated*.

## Connector description (~1,400 / 2,000)

> Contentrain turns your product's content — UI copy, docs, structured
> entries — into a typed, reviewable layer that lives in your own Git
> repository.
>
> Connect Claude to a Contentrain project and it can read your content
> models, list and inspect entries, and make changes that land as real Git
> commits on a review branch — never as unreviewed writes to your main
> branch. Every write is validated against your schema first, so an agent
> cannot invent a field, break a locale, or corrupt a model.
>
> • Ask what content exists — models, fields, entries, locales, branch status
> • Draft, update, and delete entries across collections, singletons,
>   documents, and dictionaries
> • Work in any configured locale and keep translations consistent
> • Validate a project and get an actionable report before publishing
> • Manage media assets on eligible plans
>
> You authorize one project at a time through OAuth with explicit scopes;
> read-only and destructive tools are separately annotated; writes follow
> your project's review or auto-merge workflow; access is revocable
> instantly from Connected Apps.
>
> Content stays as plain JSON and Markdown in your repo — no vendor database
> lock-in. The developer packages (CLI, MCP server, SDK) are MIT-licensed
> and the Studio core is open source.
>
> Requires a Contentrain Studio account with a connected repository.

The closing line answers the portal's "what users need before they can
connect" — an incomplete answer there is a rejection reason.

## Plugin description

> Your codebase is full of content: UI labels, empty states, validation
> messages, marketing copy, docs. It's hardcoded across dozens of files,
> invisible to anyone who isn't a developer, and impossible to translate.
>
> Contentrain gives Claude the tools to fix that in place, in your own Git
> repo — no account, no database, no vendor lock-in.
>
> Ask Claude to scan your project and it finds the hardcoded strings,
> proposes a content model for them, extracts them into typed JSON or
> Markdown under `.contentrain/`, and patches the source to read from a
> generated, type-safe client. From then on the content is queryable,
> translatable, and reviewable as ordinary Git history.
>
> Includes:
> • Skills that teach Claude Contentrain's content model, field types, and
>   the two-phase normalize workflow
> • Framework guidance for Vue, Nuxt, Next.js, React, Astro, SvelteKit,
>   Node, Expo, and React Native, loaded on demand
> • A local MCP server that performs every file operation deterministically
>   — canonical serialization, schema validation, Git-backed safety — so an
>   agent can't corrupt a model or invent a field
>
> Everything runs locally against your repository. When the work becomes
> team work — review, roles, media, publishing — the same content model
> connects to Contentrain Studio without changing a file.
>
> MIT licensed. Requires Node 22+ and a Git repository.

The last two paragraphs are the funnel: the plugin acquires with no account,
and `SETUP.md` walks the user into Studio when the work outgrows local.

### Two corrections applied to this description

1. **A "Commands for the common jobs" bullet was removed.** The repo has no
   Claude Code `commands/` directory — the only `commands` directories are
   `packages/cli/src/commands`, which are citty CLI subcommands
   (`contentrain init`), an unrelated thing. The bullet also duplicated what
   skills already do: plugin skills are invocable as `/contentrain:normalize`
   without any `commands/` directory. `claude plugin validate` checks
   structure, not copy accuracy, so this would have reached the review
   pipeline as a description promising unbuilt features.
2. **The framework bullet was wrong in count and in fact.** It listed 7; there
   are 9 (`expo` and `react-native` were missing). More importantly
   `packages/skills/frameworks/*.md` was referenced by **zero** skills — it
   shipped in the npm package but nothing loaded it, so a curated plugin
   would not have carried it at all and the bullet would have been false.
   The guides are now linked from `contentrain-normalize/SKILL.md`. Because
   skills load progressively — only the `SKILL.md` frontmatter sits in
   context, bodies and references load on demand — this keeps the "works with
   your stack" claim true at zero always-on context cost. That matters: the
   `/plugin` detail view now shows a **Context cost** estimate before install,
   so shipping 9 guides as 9 separate skills would be visibly penalized.

## Plugin submission mechanics (verified against Claude Code docs)

There are two Anthropic marketplaces and only one accepts submissions:

| Marketplace | Reach | Entry |
|---|---|---|
| `claude-plugins-official` | Registered automatically on first interactive Claude Code start | Curated by Anthropic, at its discretion. **No application process** |
| `claude-community` | User adds `anthropics/claude-plugins-community` manually | In-app form → automated validation + safety screening |

Two submission forms exist, and the plan gate runs the opposite way to what
you would guess:

- **Console** — `platform.claude.com/plugins/submit` — for individual authors
  **not** in a Team or Enterprise org. **This is our path; no plan gate.**
- **claude.ai** — `claude.ai/admin-settings/directory/submissions/plugins/new`
  — *requires* a Team or Enterprise org with directory management access.

Run `claude plugin validate` locally first; the review pipeline runs the same
check. Approved plugins are pinned to a commit SHA in the community catalog,
but **CI advances the pin automatically** as new commits land, and the public
catalog syncs nightly — so this is a one-time submission, not a release chore.

The official marketplace is earned through usage, not applied for. If
Anthropic does list us there, the CLI can then prompt users to install via
plugin hints.

## Portal answers both listings share

- **Reads, writes, or both?** Both — read and write tools are separate and
  separately annotated.
- **First-party API?** Yes. The MCP server is Contentrain's own; the domain
  matches the service.
- **Primary use cases:** (1) rescue hardcoded strings into governed content,
  (2) add and maintain locales as a normal content operation, (3) let
  non-developers and agents edit product content without touching source,
  (4) keep AI-generated copy inside a schema and a review workflow.

## Open items before submitting

- Re-verify the category vocabulary against the portal (the list used here
  came from a third-party aggregation, not Anthropic's own docs).
- Confirm the remaining Console form fields; only the public-repo and
  `claude plugin validate` requirements are documented.
- Keep the two descriptions in sync with the spine if either is edited.
