---
title: Reconcile & Divergence
description: "What makes the contentrain and base branches diverge, how the content-aware three-way merge resolves it, and the closed set of conflicts it can hand back"
order: 5
slug: reconcile
---

# Reconcile & Divergence

Contentrain keeps content on a dedicated `contentrain` branch that normally *contains* the base branch, so advancing the base is always a fast-forward. This page is about what happens when that stops being true.

## How divergence happens

The invariant breaks when a change lands on the base branch directly. That is not a mistake — it is what a **dual-domain migration** requires: a package bump and a `.contentrain/` schema change that must ship as one atomic PR.

From then on the two branches have diverged:

- writes still land safely on `contentrain`
- they report `base_advance: "blocked_diverged"` instead of advancing the base
- `contentrain status` shows the relation in both directions instead of a one-sided "in sync"

::: info A diverged write is a partial success, not a failure
The content was written. What did not happen is the fast-forward. Treating this as an error would push people toward force-pushing a branch that has legitimate commits on it.
:::

`contentrain_status` reports the relation as one of `in_sync` · `content_ahead` · `base_ahead` · `diverged`.

## Two doors

| Door | Shape |
|---|---|
| `contentrain_reconcile` (MCP) | `dry_run` previews, `resolutions` answer conflicts, execute lands the merge |
| `contentrain reconcile` (CLI) | Dry-run plan, one interactive question per conflict, then execute |

```bash
contentrain reconcile              # plan + interactive decisions
contentrain reconcile --yes        # execute a CLEAN plan without prompting
contentrain reconcile --json       # emit the dry-run plan for scripts
```

`--yes` never defaults a conflict. A plan with open questions always stops.

## The rule everything reduces to

Reconcile is a three-way merge: **base** is the merge-base tree, **ours** is `contentrain`, **theirs** is the base branch. Every policy row below reduces to one function:

| base | ours | theirs | Result |
|---|---|---|---|
| same | same | same | unchanged |
| — | changed | changed *identically* | converges |
| same | changed | — | ours wins |
| same | — | changed | theirs wins |
| present | deleted | edited | **`delete_edit` conflict** |
| — | changed | changed *differently* | **`both_changed` conflict** |

A side that did not change keeps no vote. Delete-versus-edit is split out because it needs a different question — "keep or drop?" rather than "which value?".

Equality is **canonical**, not textual: both values are normalized through `sortKeys` — which drops `null` and `undefined` and sorts keys recursively, the same normal form written to disk — then compared. So `{ a: null }` equals `{}`, key order never matters, and absent equals null. Exactly the distinctions the storage layer cannot represent anyway.

## Granularity, by kind

The merge is content-aware: it descends to the smallest unit where a disagreement is real.

| Kind | Merged at | Notes |
|---|---|---|
| Collection / singleton | **Field** inside an entry | Two sides editing different fields of one entry both win |
| Dictionary | **Key** | |
| Vocabulary | **Term + locale** | One side adding a term's Turkish while another fixes its English are different leaves. Only the same term in the same locale is a question |
| Model | **Top-level key**, recursing one level into `fields` | Two sides adding different fields both win |
| Document (`.md`) | Frontmatter **key by key**; body as **one leaf** | |
| Meta | Field, with special rules — see below | |
| Anything unrecognized | **Whole file** | The planner never invents content for a file it does not understand |

::: danger Document bodies are never text-merged
Interleaving two prose edits line by line produces syntactically plausible, editorially wrong hybrids. Choosing between two versions of prose is a content decision, and MCP does not make content decisions.
:::

If a document's frontmatter does not survive a parse→serialize round trip — the parser round-trips scalars and scalar arrays, but nested maps serialize without parsing back — that document falls back to whole-file resolution rather than having its nested data silently destroyed.

### Meta has its own rules

| Field | Rule |
|---|---|
| `updated_at` | The later timestamp wins; present beats absent |
| `updated_by` | Follows whichever side supplied the winning `updated_at`. With no timestamps to arbitrate, ours is kept and an advisory says so |
| `status` | One side's change wins mechanically — but **two different publish decisions are a question for a human, never a pick** |

An entry-level delete-versus-edit in meta resolves mechanically to the edited side with an advisory: meta is bookkeeping that trails content, and the *content* delete-versus-edit conflict — reported separately — is the real question.

## The four phases

1. **Models** — schema first, because the schema decides where content lives
2. **Per-model content and meta** — each side enumerated with *its own* model definition, so a `content_path` or strategy change moves files correctly
3. **Fixed paths** — project settings merge by top-level key, so a branch renaming the content root and main flipping the workflow do not collide
4. **Unclaimed scan** — everything under the recognized roots no phase claimed

::: warning Structural keys block a model's content phase
`kind`, `i18n`, `locale_strategy` and `content_path` decide where a model's files live and how they are keyed. When one of *those* is itself in conflict, the model's content cannot be located safely, so the content phase is blocked and only the model-level conflict is reported. Answer that one, then reconcile again.
:::

## The conflict set is closed

Consumers key localized editor questions on these values, so the set is a contract: adding one is a minor version bump with a changelog entry; renaming or removing one is breaking.

| `ConflictCode` | Means |
|---|---|
| `field_value_conflict` | Collection/singleton: the same field changed differently on both sides |
| `dictionary_value_conflict` | The same dictionary key, two different values |
| `vocabulary_value_conflict` | The same term + locale, two different translations |
| `model_key_conflict` | The same model schema key changed differently |
| `meta_status_conflict` | Both sides moved an entry's publish status differently |
| `document_body_conflict` | Both sides edited a document body |
| `frontmatter_value_conflict` | The same frontmatter key, two different values |
| `delete_edit_conflict` | One side deleted what the other edited |
| `file_conflict` | An unrecognized file changed on both sides — resolved by choosing a side |

Each conflict arrives as a `ConflictItem`:

```ts
{
  id: string            // derived from the position AND the three values
  path: string          // content-root-relative
  kind: 'collection' | 'singleton' | 'document' | 'dictionary'
      | 'vocabulary' | 'model' | 'meta' | 'file'
  model?: string
  key?: string          // entry id, dictionary key, term, or schema key
  field?: string
  locale?: string
  base?: unknown        // the three values, for display
  ours?: unknown
  theirs?: unknown
  code: ConflictCode
  message: string       // ready-to-display English sentence
  suggested?: 'ours' | 'theirs'
}
```

`suggested` appears only where the approved policy names a preferred side — model schema keys suggest `theirs`, carrying "the schema belongs to the developer". **It is never auto-applied.**

## Answering conflicts

A plan with conflicts is not applied. Everything mechanical is already merged into the plan's changes; you collect decisions and run a second round:

```ts
type ConflictResolution =
  | { id: string, choose: 'ours' | 'theirs' }   // absence on that side means deletion
  | { id: string, value: unknown }              // a hand-authored replacement
```

::: tip Stale decisions cannot land
`ConflictItem.id` is derived from the position **and** the three values. If any side moved between the preview and the decision, the id no longer matches: the resolution is dropped and the conflict re-reported with a fresh id.

That is compare-and-set, for free, with no extra round trip — and it is why an agent may safely plan, think, and then answer.
:::

## What executing produces

A **two-parent merge commit** on `contentrain`, after which the fast-forward advance works again.

The result reports what happened mechanically:

| Field | Meaning |
|---|---|
| `files_merged` | Content-layer files whose merged output differs from ours |
| `entries_taken_ours` / `entries_taken_theirs` | Items resolved by taking the side that changed them |
| `entries_field_merged` | Items where both sides changed different fields and the union won |
| `regenerated` | Derived files rebuilt — `['.contentrain/context.json']`, or empty on a no-op |

## Provider requirements

Reconcile needs two optional `RepoProvider` members: `getMergeBase` (the common ancestor) and `createMergeCommit` (a genuinely two-parent commit, so the reconciled ref contains both histories).

| Provider | Reconcile |
|---|---|
| Local | Yes |
| GitHub | Yes |
| GitLab | Falls back to an MR flow |

A provider implementing neither cannot drive a reconcile; callers fall back to a PR/MR flow.

## Related Pages

- [Core Concepts](/concepts#divergence) — where divergence sits in the branch model
- [CLI](/packages/cli#contentrain-reconcile) — the interactive command
- [MCP Tools](/packages/mcp) — `contentrain_reconcile` and `contentrain_status`
- [RepoProvider Reference](/reference/providers) — `getMergeBase` and `createMergeCommit`
- [Types](/packages/types) — `ConflictItem`, `ConflictCode`, `ConflictResolution`, `BaseAdvance`
