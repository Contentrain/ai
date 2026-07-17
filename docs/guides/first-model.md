---
title: Your First Model
description: "A guided end-to-end walkthrough — define a model, save content, publish, review, and query it, with real tool outputs at every step"
order: 1
category: guides
slug: first-model
---

# Your First Model

[Getting Started](/getting-started) wires up your agent; [Core Concepts](/concepts) explains the vocabulary. This page is the bridge: one concrete model taken end-to-end — define → save → publish → read → query → review — showing the **actual tool responses and files** at every step.

Everything below is captured from a real run against `@contentrain/mcp`. Branch names, entry IDs, commit hashes, and timestamps will differ on your machine; shapes and semantics will not.

## What You'll Build

An `faq` **collection** — the model kind that shows the most machinery: typed fields, auto-generated entry IDs, object-map storage, per-entry publish status, and the git workflow. About 10 minutes.

## Setup

```bash
npx contentrain init --yes
```

`init` creates `.contentrain/` (config, `models/`, `content/`, `meta/`, vocabulary, context), runs `git init` with an initial commit if needed, and writes your IDE's MCP config. The `--yes` defaults matter for this walkthrough: workflow is **auto-merge**, default locale `en`, domains `marketing`, `blog`, `system`.

## Step 1 — Look Before You Write

Agents (and you) should start every session with `contentrain_status`. Ask your agent *"What's the state of my Contentrain project?"*:

```json
{
  "initialized": true,
  "config": {
    "stack": "other",
    "workflow": "auto-merge",
    "locales": { "default": "en", "supported": ["en"] },
    "domains": ["marketing", "blog", "system"]
  },
  "models": [],
  "branches": { "total": 0, "merged": 0, "unmerged": 0, "cleaned_up": 0 },
  "next_steps": ["Create models with contentrain_model_save"]
}
```

*(Response abridged — the full payload also carries `context`, `vocabulary`, and last-operation info.)*

No models yet, no branches, and the response tells the agent what to do next. This is the pattern everywhere: every tool response carries `next_steps`.

## Step 2 — Define the Model

Tell your agent:

```text
Create an FAQ model in the marketing domain: a required question (max 200 chars),
a required markdown answer, and a category limited to general/billing/technical.
```

The agent calls `contentrain_model_save` with:

```json
{
  "id": "faq",
  "name": "FAQ",
  "kind": "collection",
  "domain": "marketing",
  "i18n": true,
  "fields": {
    "question": { "type": "string", "required": true, "min": 1, "max": 200 },
    "answer": { "type": "markdown", "required": true },
    "category": { "type": "select", "options": ["general", "billing", "technical"] }
  }
}
```

Response:

```json
{
  "status": "committed",
  "action": "created",
  "model": "faq",
  "validation": { "valid": true, "errors": [] },
  "git": {
    "branch": "cr/model/faq/1784311677-13e8",
    "action": "auto-merged",
    "commit": "076e2a88f0bba8a97bb33526e5a22b0190d8f1d2",
    "sync": {
      "synced": [".contentrain/context.json", ".contentrain/models/faq.json"],
      "skipped": []
    }
  },
  "content_path": ".contentrain/content/marketing/faq/",
  "example_file": ".contentrain/content/marketing/faq/en.json",
  "next_steps": ["Add content with contentrain_content_save"]
}
```

Three things to notice:

- **The write happened on a branch.** `cr/model/faq/{timestamp}-{suffix}` was created, committed, and — because the workflow is `auto-merge` — merged into the dedicated `contentrain` branch immediately.
- **Your working tree got the result, not the process.** The `sync` block lists the files copied back; MCP never runs checkout/stash/merge in your working tree.
- **The schema was validated before anything landed.** A misplaced constraint (say, `options` on a non-select field) would have been a blocking error, not a silent no-op.

## Step 3 — Save Content

```text
Add two FAQ entries: "What is Contentrain?" and "Do I need a cloud account?"
— both in the general category.
```

The agent calls `contentrain_content_save`:

```json
{
  "model": "faq",
  "entries": [
    {
      "locale": "en",
      "data": {
        "question": "What is Contentrain?",
        "answer": "Git-native content governance: your agent writes content through deterministic MCP tools, humans review through branches.",
        "category": "general"
      }
    },
    {
      "locale": "en",
      "data": {
        "question": "Do I need a cloud account?",
        "answer": "No. The core is local-first and MIT-licensed — content lives in your repo.",
        "category": "general"
      }
    }
  ]
}
```

Response:

```json
{
  "status": "committed",
  "results": [
    { "action": "created", "id": "898df4b18fc4", "locale": "en" },
    { "action": "created", "id": "ee920ffa2a68", "locale": "en" }
  ],
  "git": {
    "branch": "cr/content/faq/1784311677-de96",
    "action": "auto-merged",
    "commit": "31fc18b322387a08174e89b78ff8632d4f9e9f14",
    "sync": {
      "synced": [
        ".contentrain/content/marketing/faq/en.json",
        ".contentrain/context.json",
        ".contentrain/meta/faq/en.json"
      ],
      "skipped": []
    }
  },
  "validation": { "valid": true, "errors": [] }
}
```

Entries got **auto-generated 12-hex IDs**. Content was **validated before the commit** — if `category` had been `"pricing"` (not in `options`) or `question` had blown past `max: 200`, the response would have been a validation error and *nothing* would have been written.

Here is what actually landed on disk:

```json
// .contentrain/content/marketing/faq/en.json
{
  "898df4b18fc4": {
    "answer": "Git-native content governance: your agent writes content through deterministic MCP tools, humans review through branches.",
    "category": "general",
    "question": "What is Contentrain?"
  },
  "ee920ffa2a68": {
    "answer": "No. The core is local-first and MIT-licensed — content lives in your repo.",
    "category": "general",
    "question": "Do I need a cloud account?"
  }
}
```

An **object-map keyed by entry ID** with alphabetically sorted keys — canonical serialization. Two people adding entries in parallel land on different keys and merge without conflict.

Status lives elsewhere: each new entry starts as `draft` in `.contentrain/meta/faq/en.json`. Saving content is not a publish decision.

## Step 4 — Publish

Publishing is a deliberate, separate act — the only tool that changes status is `contentrain_bulk`:

```json
{
  "operation": "update_status",
  "model": "faq",
  "entry_ids": ["898df4b18fc4", "ee920ffa2a68"],
  "status": "published"
}
```

Response:

```json
{
  "status": "committed",
  "operation": "update_status",
  "message": "Updated 2 meta record(s) to status \"published\" across locales [en].",
  "updated": 2,
  "updated_by_locale": { "en": ["898df4b18fc4", "ee920ffa2a68"] },
  "git": {
    "branch": "cr/bulk/faq/1784311678-ebde",
    "action": "auto-merged",
    "commit": "09025eb5dba8e2f49281caa591f0f0bde97302af"
  }
}
```

And the meta file now reads:

```json
// .contentrain/meta/faq/en.json
{
  "898df4b18fc4": { "source": "agent", "status": "published", "updated_by": "contentrain-mcp" },
  "ee920ffa2a68": { "source": "agent", "status": "published", "updated_by": "contentrain-mcp" }
}
```

`source: "agent"` is the audit trail — who created this content is recorded per entry, forever, in git.

## Step 5 — Read It Back

`contentrain_content_list` returns the **output format** — an array with `id` injected, not the storage object-map:

```json
{
  "kind": "collection",
  "data": [
    {
      "id": "898df4b18fc4",
      "answer": "Git-native content governance: your agent writes content through deterministic MCP tools, humans review through branches.",
      "category": "general",
      "question": "What is Contentrain?"
    },
    {
      "id": "ee920ffa2a68",
      "answer": "No. The core is local-first and MIT-licensed — content lives in your repo.",
      "category": "general",
      "question": "Do I need a cloud account?"
    }
  ],
  "total": 2,
  "locale": "en",
  "offset": 0,
  "limit": 2
}
```

Storage is optimized for git merges; output is optimized for consumption. Same data, two shapes — [Model Kinds](/reference/model-kinds) covers the distinction per kind.

## Step 6 — Query From Your App

```bash
npx contentrain validate   # → "Project is valid!" — 0 errors, 0 warnings
npx contentrain generate   # → typed client in .contentrain/client/, #contentrain imports added
```

```ts
// query-test.mjs
import { query } from '#contentrain'

const faqs = query('faq').locale('en').where('category', 'general').sort('question', 'asc').all()
console.log(faqs.map(f => f.question))
console.log('total:', query('faq').locale('en').count())
```

```text
$ node query-test.mjs
[ 'Do I need a cloud account?', 'What is Contentrain?' ]
total: 2
```

Fully typed, synchronous, zero runtime dependencies — the client is generated from your models. See the [Query SDK](/packages/sdk) for the full API and the CDN transport.

## The Git Story So Far

Everything above is ordinary git history on the `contentrain` branch:

```text
$ git log --oneline
09025eb [contentrain] bulk: update status → published for faq
31fc18b [contentrain] content: faq
076e2a8 [contentrain] created: faq
3927fa7 [contentrain] configure MCP servers
63c7b00 [contentrain] install AI rules
...
```

Every operation is a commit you can inspect, revert, or bisect. That is the whole governance model: **nothing reaches your content layer except through a reviewable git transaction.**

## Switch to Review Mode

Auto-merge is right for solo work. For teams, flip one key in `.contentrain/config.json`:

```json
{ "workflow": "review" }
```

Now the same `contentrain_content_save` call answers differently:

```json
{
  "status": "committed",
  "results": [{ "action": "created", "id": "7e579bd36c35", "locale": "en" }],
  "git": {
    "branch": "cr/content/faq/1784312115-09eb",
    "action": "pending-review",
    "commit": "b44c488ae82b91e18fcc248dbfef1e955e2c3e89"
  }
}
```

`"pending-review"` — the branch exists, the commit exists, but nothing merged. Your working tree does not have the entry yet. Inspect it:

```text
$ npx contentrain diff

●  Pending branches (1)
     ● cr/content/faq/1784312115-09eb  2 file(s), +10/-0
```

Then merge (or reject) — from the CLI, the [serve UI](/guides/serve-ui) at `/branches`, or by asking your agent to call `contentrain_merge`:

```text
$ npx contentrain merge cr/content/faq/1784312115-09eb --yes

◆  Merged cr/content/faq/1784312115-09eb (commit 5e4f9406)
     Synced 3 file(s) to working tree.
```

The entry lands, the branch is cleaned up (including its remote copy, if pushed), and the git history records who approved what. This is the same review loop [Contentrain Studio](/studio) puts a team web UI on top of.

## Where Next

- **[Normalize Flow](/guides/normalize)** — the reverse direction: extract the hardcoded strings you already have into models like this one
- **[Model Kinds](/reference/model-kinds)** — singleton, dictionary, and document, with the same storage rigor
- **[Field Types](/reference/field-types)** — all 27 types and exactly which constraints are enforced where
- **[i18n Workflow](/guides/i18n)** — add locales; `contentrain_bulk copy_locale` scaffolds translations
- **[Query SDK](/packages/sdk)** — relations, documents, dictionaries, and the CDN transport
