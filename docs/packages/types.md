---
title: Types
description: Complete reference for @contentrain/types — the shared TypeScript type vocabulary used by every package in the Contentrain ecosystem
order: 5
slug: types
---

# Types

[![npm version](https://img.shields.io/npm/v/@contentrain/types)](https://www.npmjs.com/package/@contentrain/types) [![npm downloads](https://img.shields.io/npm/dm/@contentrain/types)](https://www.npmjs.com/package/@contentrain/types)

`@contentrain/types` is the shared type contract for the Contentrain ecosystem. Every package — MCP, CLI, SDK, Rules — imports its domain types from here instead of redefining them. If you are building tooling on top of Contentrain or authoring a framework integration, this is the package you depend on.

## Why a Shared Types Package?

Without a single source of truth, each package would define its own `ModelDefinition`, `FieldDef`, or `ContentrainConfig` — and they would inevitably drift. `@contentrain/types` ensures:

- **One vocabulary** — every package speaks the same domain language
- **Breaking changes are visible** — a type change here is an ecosystem-level change
- **Zero runtime cost** — most exports are `type`-only, tree-shaken away in production

::: tip Ecosystem Role
- **MCP** validates and writes `ModelDefinition`
- **CLI** reads `ContentrainConfig` and `ContextJson`
- **SDK codegen** consumes `ModelDefinition` and `FieldDef`
- **Rules** align with the same model and workflow vocabulary
- **[Contentrain Studio](/studio)** operates on the same type contract — schemas defined locally work identically in team workflows
:::

## Install

```bash
pnpm add @contentrain/types
```

For type-only usage (no runtime exports needed):

```bash
pnpm add -D @contentrain/types
```

Requirements:
- Node.js 22+
- TypeScript 5.0+

## Quick Example

```ts
import type {
  ContentrainConfig,
  FieldDef,
  ModelDefinition,
  ValidationResult,
} from '@contentrain/types'

const fields: Record<string, FieldDef> = {
  title: { type: 'string', required: true },
  slug: { type: 'slug', required: true, unique: true },
}

const model: ModelDefinition = {
  id: 'blog-post',
  name: 'Blog Post',
  kind: 'collection',
  domain: 'blog',
  i18n: true,
  title_field: 'title',
  fields,
}

const config: ContentrainConfig = {
  version: 1,
  stack: 'next',
  workflow: 'review',
  locales: { default: 'en', supported: ['en', 'tr'] },
  domains: ['blog'],
}

const result: ValidationResult = {
  valid: true,
  errors: [],
}
```

## Export Catalog

### Core Unions

| Type | Values | Reference |
|------|--------|-----------|
| `FieldType` | 27 field types (`string`, `number`, `boolean`, `relation`, ...) | [Field Types](/reference/field-types) |
| `ModelKind` | `singleton`, `collection`, `document`, `dictionary` | [Model Kinds](/reference/model-kinds) |
| `ContentStatus` | `draft`, `in_review`, `published`, `rejected`, `archived` | |
| `ContentSource` | `agent`, `human`, `import` | |
| `WorkflowMode` | `auto-merge`, `review` | [Configuration](/reference/config) |
| `StackType` | `nuxt`, `next`, `astro`, `sveltekit`, `remix`, + 25 more | [Configuration](/reference/config) |
| `Platform` | `web`, `mobile`, `api`, `desktop`, `static`, `other` | |
| `ContextSource` | `mcp-local`, `mcp-studio`, `studio-ui` | |
| `CollectionRuntimeFormat` | `map`, `array` | |
| `LocaleStrategy` | `file`, `suffix`, `directory`, `none` | |
| `FileFramework` | `vue`, `svelte`, `jsx`, `astro`, `script` | |

### Core Interfaces

| Interface | Purpose |
|-----------|---------|
| `FieldDef` | Field schema definition (type, required, unique, constraints) |
| `ModelDefinition` | Full model schema (id, kind, domain, fields, i18n, locale strategy) |
| `ContentrainConfig` | Project configuration (stack, workflow, locales, domains) |
| `Vocabulary` | Shared terms for content consistency |
| `EntryMeta` | Per-entry metadata (status, source, timestamps) |
| `AssetEntry` | Asset registry entry (path, type, size, alt) |
| `ValidationError` | Structured validation issue — `severity` is `error`, `warning`, or `notice` (notices flag drift like drafts beside published entries) |
| `ValidationResult` | Validation outcome (valid flag + error list) |
| `ContextJson` | Last operation context written by MCP |
| `ModelSummary` | Lightweight model info for listing operations |

### Provider Contract Types

Third-party developers can implement custom providers by implementing these interfaces:

| Interface / Type | Purpose |
|-----------|---------|
| `RepoProvider` | Full provider contract: read, write, branch, merge, diff operations, plus optional `media?: MediaProvider`, `getMergeBase?` and `createMergeCommit?` (reconcile) members |
| `RepoReader` | Read-only interface (readFile, listDirectory, fileExists) |
| `RepoWriter` | Write interface (applyPlan for atomic commits) |
| `ProviderCapabilities` | Capability flags (localWorktree, sourceRead, sourceWrite, pushRemote, branchProtection, pullRequestFallback, astScan, optional mergeCommit) |
| `FileChange` | A single file addition, modification, or deletion (`{ path, content: string \| null }`) |
| `ApplyPlanInput` | Input for a single atomic commit (branch, changes, message, author, optional base) |
| `Commit` | Result of a commit operation (sha, message, author, timestamp) |
| `Branch` | Git branch metadata (name, sha, protected) |
| `FileDiff` | File change within a plan (path, status, before, after) |
| `MergeResult` | Merge outcome (merged flag, sha, pullRequestUrl, optional `sync?: SyncResult` for LocalProvider, optional `remote?` source-branch cleanup outcome) |
| `SyncResult` | Selective file sync result (synced, skipped, optional warning) |
| `BaseAdvance` | `'advanced' \| 'blocked_diverged'` — what happened to the base branch after a write (shared vocabulary with Studio; a PR is an attachment, never a third state) |
| `RemotePush` | `'pushed' \| 'rejected' \| 'no-remote'` — outcome of pushing the contentrain branch |
| `ConflictItem` | One surviving reconcile conflict — position (`path`, `key`, `field`, `locale`), the three values, a CLOSED `code` union (Studio keys localized editor questions on it), and a value-derived `id` |
| `ConflictCode` | Closed union of conflict kinds — adding a value is a minor + changelog entry; renaming or removing one is breaking |
| `ConflictResolution` | A decision keyed by conflict id: `{ id, choose: 'ours'\|'theirs' }` or `{ id, value }` — stale ids (values changed since the dry-run) are dropped and re-reported |
| `CommitAuthor` | Commit author metadata (name, email) |

Media facet types (implemented by providers exposing a media stack — drives the `contentrain_media_*` tools):

| Interface / Type | Purpose |
|-----------|---------|
| `MediaProvider` | Optional `RepoProvider.media` facet: `list` / `get` / `ingest` / `update` / `delete` |
| `MediaAsset` | One asset — `id`, `path` (`media/...`), optional `url`, `mime`, `size`, `alt`, `tags`, `createdAt`, `meta` |
| `MediaListOptions` | List filters (`search`, `tag`, `limit`, `cursor`) |
| `MediaListResult` | List page (`assets`, optional `nextCursor`, `total`) |
| `MediaIngestInput` | URL-based ingest input (`url`, optional `filename`, `alt`, `tags`) |
| `MediaUpdateInput` | Metadata patch (`alt`, `tags`, `filename`) |

Pre-built capability set:

- `LOCAL_CAPABILITIES` — Capability set for LocalProvider: `localWorktree`, `sourceRead`, `sourceWrite`, `pushRemote`, `astScan` and `mergeCommit` enabled; `branchProtection` and `pullRequestFallback` are `false` (a local worktree has no remote protection or PR flow). Exported from `@contentrain/types` for custom providers that back onto the local filesystem.

See [RepoProvider Reference](/reference/providers) for the complete interface definitions and a minimum-viable provider recipe.

### Storage Types

These types define the canonical JSON structure for each model kind on disk:

| Type | Model Kind | Shape |
|------|-----------|-------|
| `SingletonContentFile` | Singleton | `Record<string, unknown>` |
| `CollectionContentFile` | Collection | `Record<string, Record<string, unknown>>` (object-map by entry ID) |
| `DictionaryContentFile` | Dictionary | `Record<string, string>` (flat key-value, all strings) |

### Output Types

How MCP and SDK return content to consumers (different from storage format):

| Type | Description |
|------|-------------|
| `CollectionEntry` | `{ id: string } & Record<string, unknown>` |
| `CollectionContentOutput` | `CollectionEntry[]` (array format) |
| `DocumentEntry` | `{ slug, frontmatter, body }` — parsed markdown |
| `DocumentContentOutput` | `DocumentEntry[]` |
| `PolymorphicRelationRef` | `{ model, ref }` — cross-model relation storage |

### Metadata Types

| Type | Description |
|------|-------------|
| `SingletonMeta` | Alias for `EntryMeta` |
| `CollectionMeta` | `Record<string, EntryMeta>` — per-entry metadata map |
| `DocumentMeta` | Alias for `EntryMeta` |
| `DictionaryMeta` | Alias for `EntryMeta` |

### Scan & Graph Types

Used by the normalize flow (scan, extract, reuse):

| Type | Purpose |
|------|---------|
| `ScanCandidate` | Hardcoded string candidate with file, line, column, context |
| `DuplicateGroup` | Group of repeated strings with occurrence locations |
| `GraphNode` | File node in the project graph (category, imports, strings) |
| `ProjectGraph` | Full project structure graph (pages, components, layouts) |
| `ScanCandidatesResult` | Scan output with candidates, duplicates, and stats |
| `ScanSummaryResult` | High-level scan summary (directory breakdown, top repeated) |
| `StringContext` | Where a string appears (`jsx_text`, `template_attribute`, ...) |
| `FileCategory` | File classification (`page`, `component`, `layout`, `other`) |
| `NormalizePlan` | Normalize plan exchanged between scan and apply |
| `NormalizePlanModel` | Model proposal inside a normalize plan |
| `NormalizePlanExtraction` | One extraction target (content entry to create) |
| `NormalizePlanPatch` | One source patch inside a normalize plan |

### Runtime Constants

Beyond types, the package ships a small runtime surface: constants plus pure, dependency-free validate/serialize functions (browser-compatible — Studio shares the same validation contract through them). Constants first:

```ts
import {
  CONTENTRAIN_DIR,       // '.contentrain'
  CONTENTRAIN_BRANCH,    // 'contentrain'
  PATH_PATTERNS,         // Canonical file path patterns
  SLUG_PATTERN,          // /^[a-z0-9]+(?:-[a-z0-9]+)*$/
  ENTRY_ID_PATTERN,      // /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,39}$/
  LOCALE_PATTERN,        // /^[a-z]{2}(?:-[A-Z]{2})?$/
  CANONICAL_JSON,        // { indent: 2, encoding: 'utf-8', ... }
} from '@contentrain/types'
```

| Constant | Value | Purpose |
|----------|-------|---------|
| `CONTENTRAIN_DIR` | `'.contentrain'` | Root directory name |
| `CONTENTRAIN_BRANCH` | `'contentrain'` | Dedicated content branch name |
| `PATH_PATTERNS` | Object | Canonical paths for config, models, content, meta |
| `SLUG_PATTERN` | RegExp | Validates slug format |
| `ENTRY_ID_PATTERN` | RegExp | Validates entry IDs |
| `LOCALE_PATTERN` | RegExp | Validates ISO locale codes |
| `CANONICAL_JSON` | Object | Deterministic serialization rules |
| `RESERVED_PATHS` | `readonly string[]` | Four `.contentrain/` files this repository claims but does not yet write — see [Reserved paths](#reserved-paths) |
| `SECRET_PATTERNS` | `ReadonlyArray<RegExp>` | Provider-shaped patterns behind `detectSecrets` — extend for custom secret detection. The generic `api_key = …` rule is not in this list: it fires only when `looksLikeCredential` accepts the captured tail |

### Runtime Functions

Validate functions (pure, dependency-free):

| Function | Purpose |
|----------|---------|
| `validateSlug(slug)` | Kebab-case slug validation |
| `validateEntryId(id)` | Entry ID format validation |
| `validateLocale(locale, config)` | Locale format + config support check |
| `detectSecrets(value)` | Detect potential secrets in field values |
| `looksLikeCredential(tail)` | Whether a value assigned to an API-key setting reads as a credential (has a digit, mixes letters and digits in a token) rather than a placeholder or setting name |
| `validateFieldValue(value, fieldDef)` | Full field schema validation (type, required, min/max, pattern, select) |
| `validateSemanticType(value, type)` | Semantic checks for typed values (integer, date, email, url, ...) |
| `validateAccept(value, accept)` | Extension-based `accept` constraint check for media paths |
| `isMediaType(type)` | Whether a field type is media-backed |

Serialize functions (pure, dependency-free):

| Function | Purpose |
|----------|---------|
| `sortKeys(obj, fieldOrder?)` | Recursive key sorting for canonical output |
| `canonicalStringify(data, fieldOrder?)` | Deterministic JSON serialization |
| `generateEntryId()` | 12-char hex entry ID generation |
| `parseMarkdownFrontmatter(content)` | Parse YAML frontmatter + body from markdown |
| `serializeMarkdownFrontmatter(data, body)` | Serialize data + body into markdown frontmatter |

Execution/approval functions (pure; `computePlanHash` uses Web Crypto):

| Function | Purpose |
|----------|---------|
| `riskRank(risk)` | Position on the risk ladder; higher is more severe |
| `highestRisk(risks)` | The worst class in a list — how a multi-step plan is rated |
| `isTerminalRunStatus(status)` | Whether a run will move on its own |
| `isReservedPath(path)` | Whether a path is one of `RESERVED_PATHS` |
| `approversFor(receipt, gate)` | Approvers recorded on a receipt for one gate |
| `planHashPayload(plan)` | The exact canonical-JSON bytes `plan_hash` covers |
| `computePlanHash(plan)` | `Promise<string>` — SHA-256 of that payload, lowercase hex |
| `effectiveRisk(plan)` | The class a plan is judged at — its own, or its worst step's |
| `requiredApprovals(plan, policy?)` | What a policy demands of a plan, before any decision |
| `evaluateApproval(input)` | May this proceed? Requirements, who met them, and why a decision did not count |

Unique constraints and relation references need external state (all entries / target existence), so they stay in MCP's validator — `validateFieldValue` covers everything schema-level.

### Git Transaction Types

| Type | Purpose |
|------|---------|
| `SyncResult` | Result of selective file sync (synced files, skipped files, warning) |
| `ContentrainError` | Structured error with code, message, agent hint, and developer action |
| `ScaffoldTemplate` | Template definition for project scaffolding |

## Execution & Approval Contracts

`@contentrain/types` is the contract layer for operations, not just for content
shapes. The migration engine produces plans and receipts, Studio renders the
plan card and collects approvals, and MCP is where a plan's steps run. If each
defined its own `RiskClass`, "destructive" would mean three different things and
the approval guarding it would be theatre.

### Risk and approval

```ts
import { RISK_CLASSES, highestRisk } from '@contentrain/types'

// A survey that ends in a deploy is a deploy.
highestRisk(['read_only', 'bulk_content', 'deployment'])  // 'deployment'
```

`RiskClass` is an ordered ladder — `read_only` → `low_risk_content` →
`bulk_content` → `destructive_schema` → `external_effect` →
`financially_material` → `deployment` — and a policy written for one rung is
expected to cover everything above it.

`ApprovalGate` keeps three questions separate: `plan` (before the work starts,
on scope and cost), `change` (on the diff the agent produced), and `release`
(on production effect). Approving what will be done is not approving what was
produced, and neither is permission to publish it.

| Type | Purpose |
|------|---------|
| `ApprovalRule`, `ApprovalPolicyFile` | `.contentrain/approval-policies.json` — which risk needs whose approval, in which mode (`auto` / `single` / `quorum`). Lives in git beside the content it governs, so the policy in force is the policy on the branch. Rules are additive: a policy file can only make a project stricter |
| `ApprovalRequirement` | An outstanding demand, carrying `because` — the risk class of the rule that produced it — so a UI can say why a gate appeared |
| `ApprovalGrant` | A decision actually given, bound to an exact `plan_hash`. Change the plan and its grants stop applying |
| `ActorRef` | Who is acting. `kind` (`human` / `agent` / `system`) is load-bearing: an agent may never approve its own work |

### Plans and receipts

| Type | Purpose |
|------|---------|
| `ExecutionPlan` | An operation fully described before it runs: steps, union scope, risk, estimate, rollback, assumed repository state |
| `ExecutionStep` | One tool invocation, with its own risk and scope |
| `ExecutionScope` | What is touched — models, locales, entries, routes, files, assets, providers, external domains. An absent field means "none", not "unknown" |
| `ExecutionReceipt` | What happened: status, approvals, checkpoints, verification, measured cost, and the scope actually touched — the same `ExecutionScope` shape, so prediction and outcome can be subtracted |
| `RollbackPlan` | The undo as a command, not a promise. `available: false` tells the approver *before* deciding |
| `RunStatus` | `draft → planned → awaiting_approval → approved → scheduled → queued → running → verifying → completed`, plus the interrupted states |
| `DeploymentTarget` | Where a build is published. Carries a `secret_ref`, never a secret — this document is written to git |
| `AutomationDefinition` | Reserved shape for `.contentrain/automations.json`; nothing reads it yet |

### The evaluator

```ts
import { evaluateApproval, requiredApprovals } from '@contentrain/types'

// For the plan card, before anyone has decided:
requiredApprovals(plan, policy)
// → [{ gate: 'release', mode: 'quorum', min_approvals: 2, because: 'deployment' }]

// At the gate:
const decision = evaluateApproval({ plan, policy, grants, commit_sha, now })
decision.allowed          // every requirement met and the plan has not expired
decision.outstanding      // what is still missing, with who has signed so far
decision.rejected_grants  // decisions that did not count, each with a reason
decision.reasons          // one line per blocker, written for a person
```

It replaces a role check. Asking "is this person an owner?" cannot express "a
bulk publish needs a second pair of eyes even from the owner", and cannot tell a
typo fix from a domain cutover. The evaluator asks about the action instead: its
risk, its scope, and what the project's policy says about that combination.

| Rule | Why |
|------|-----|
| A plan cannot understate itself | `effectiveRisk()` takes the worst of the plan's declared class and its steps', so a plan labelled `read_only` carrying a deploy step is evaluated as a deploy |
| Each matching rule is its own requirement, all must be met | Merging two rules needs a way to combine modes, roles and counts — and every such rule has a case where the result is *looser* than one of its inputs |
| `auto` does not climb the ladder | Every other mode covers its class and everything above it. If `auto` did too, one `auto` rule on a low rung would exempt every heavier operation above it |
| An agent never approves | Not its own work, not anyone's. A plan's author cannot approve it either unless the project sets `allow_self_approval` — which does not extend to agents |
| A `change` decision is about a diff | Presented with a different branch tip than the one reviewed, it does not count |
| `now` is an input | Nothing reads the clock, so a blocked run can be explained months later by replaying the same arguments |

Every rejected decision carries a machine-readable `GrantRejection` reason —
`plan_hash_mismatch`, `commit_mismatch`, `expired`, `agent_approver`,
`self_approval`, `role_not_permitted`, `duplicate_approver`,
`no_matching_requirement` — because the useful question is never "is it blocked"
but "I approved this, why is it still blocked".

With no `.contentrain/approval-policies.json`, `DEFAULT_APPROVAL_POLICY`
applies: read-only work proceeds, everything else wants one reviewer on the
diff. Whether a project consults the evaluator at all is still governed by its
`workflow` setting.

### `plan_hash`

```ts
import { computePlanHash } from '@contentrain/types'

const plan_hash = await computePlanHash(plan)
```

SHA-256 over canonical JSON (sorted keys, 2-space indent, trailing newline) of
the plan's semantic fields. Excluded: `plan_hash` itself, `id`, `created_at`,
`created_by`, `idempotency_key` — who built a plan, when, under which run id and
with which deduplication key do not change what the plan will do, and
regenerating the same operation must produce the same hash or idempotency and
approval binding both break.

Everything else is covered, so a widened scope, an added step, a raised estimate
or a withdrawn rollback each invalidate every approval the plan had collected.

Async because it uses Web Crypto, which works in Node 18+, Deno, Bun, workers
and browsers alike — this package is consumed in all of them and must not reach
for `node:crypto`. A non-cryptographic hash was rejected: approvals are pinned
to this value, so a collision is an approval bypass.

### `SourceDeltaPlan`

The WordPress→repository delta — **not** `contentrain_reconcile`, which merges
two git branches through their common ancestor and knows nothing about
WordPress. A source delta must be written to the repository *before* reconcile
runs on the git side.

It carries explicit deletion tombstones, because `modified_after` is a filter on
changed records and never reports a deletion: a post deleted in WordPress simply
stops appearing. `deletions_detectable: false` must not be read as "nothing was
deleted" — it means this cursor could not tell. It also carries slug moves
(which generate redirects) and semantic conflicts, where the same record changed
at the origin *and* in the repository.

### Reserved paths

`RESERVED_PATHS` names four files under `.contentrain/` that this repository has
claimed but does not yet write:

| Path | Will hold |
|------|-----------|
| `.contentrain/capabilities.json` | `CapabilityManifest` |
| `.contentrain/automations.json` | `AutomationDefinition[]` |
| `.contentrain/approval-policies.json` | `ApprovalPolicyFile` |
| `.contentrain/redirects.json` | Source→destination URL map |

`.contentrain/` is a shared namespace — Studio, the migration engine and a
customer's own tooling all write into it — so a name claimed here cannot later
be taken for something else, and the tools that walk the directory know these
four are expected rather than stray.

Until a tool owns one, the behaviour is narrow and pinned by tests in
`@contentrain/mcp`:

- `contentrain_doctor` and `contentrain_validate` ignore them completely. They
  are not orphans, not broken content, and not the validator's business.
- `contentrain_reconcile` treats each as one opaque file: it takes the side that
  changed it, and reports `file_conflict` when both sides did. It never merges
  their interiors — a field-level union on an approval policy would produce a
  policy nobody wrote.

::: tip Migration contracts
The sibling family (`RawIR`, `ProjectIR`, `CapabilityManifest`,
`MigrationHandoff`) is documented in the
[package README](https://github.com/Contentrain/ai/tree/main/packages/types#migration-contracts).
:::

## Import Style

Type-only imports (recommended for application code):

```ts
import type { ModelDefinition, ContentrainConfig, FieldDef } from '@contentrain/types'
```

Runtime imports (when you need constants):

```ts
import { PATH_PATTERNS, CANONICAL_JSON, CONTENTRAIN_DIR } from '@contentrain/types'
```

## Stability

This package is the shared public contract across the ecosystem:

- Types exported from the package root are the **public surface**
- Packages depend on these shared definitions instead of redefining domain types
- Breaking changes here are **ecosystem-level breaking changes**
- The package should stay small, dependency-light, and stable

## Development

From the monorepo root:

```bash
pnpm --filter @contentrain/types build
pnpm --filter @contentrain/types test
pnpm --filter @contentrain/types typecheck
```

## Related Pages

- [MCP Tools](/packages/mcp) — Validates and writes models using these types
- [CLI](/packages/cli) — Reads config and context using these types
- [Query SDK](/packages/sdk) — Codegen consumes model definitions and field types
- [Rules & Skills](/packages/rules) — Aligns with the same vocabulary
- [Model Kinds](/reference/model-kinds) — Detailed specification of the four model kinds
- [Field Types](/reference/field-types) — Comprehensive field type reference
- [Configuration](/reference/config) — Config file schemas and directory layout
