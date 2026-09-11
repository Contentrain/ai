# `@contentrain/types`

[![npm version](https://img.shields.io/npm/v/%40contentrain%2Ftypes?label=%40contentrain%2Ftypes)](https://www.npmjs.com/package/@contentrain/types)
[![GitHub source](https://img.shields.io/badge/source-Contentrain%2Fai-181717?logo=github)](https://github.com/Contentrain/ai/tree/main/packages/types)
[![Docs](https://img.shields.io/badge/docs-ai.contentrain.io-0f172a)](https://ai.contentrain.io/reference/config)

Shared TypeScript types for the Contentrain ecosystem.

Start here:

- [2-minute product demo](https://ai.contentrain.io/demo)
- [Config and format reference](https://ai.contentrain.io/reference/config)

This package is the common schema layer used by:

- `@contentrain/mcp`
- `contentrain`
- `@contentrain/query`
- `@contentrain/rules`

It defines the stable type vocabulary for models, config, metadata, validation, scanning, context files, and provider contracts (enabling third-party RepoProvider implementations).

## When To Use It

Use `@contentrain/types` when you are:

- building tooling on top of Contentrain packages
- sharing model/config types between packages in a workspace
- authoring framework integrations or SDK extensions
- consuming Contentrain JSON structures directly in TypeScript
- implementing a custom `RepoProvider` for a new git backend

## Install

```bash
pnpm add @contentrain/types
```

## What It Exports

Core unions:

- `FieldType`
- `ModelKind`
- `ContentStatus`
- `ContentSource`
- `WorkflowMode`
- `StackType`
- `Platform`
- `ContextSource`
- `CollectionRuntimeFormat`
- `LocaleStrategy`

Core interfaces:

- `FieldDef`
- `ModelDefinition`
- `ModelSummary`
- `ContentrainConfig`
- `Vocabulary`
- `EntryMeta`
- `AssetEntry`
- `ValidationError`
- `ValidationResult`
- `ScaffoldTemplate`
- `ScanCandidate`
- `DuplicateGroup`
- `GraphNode`
- `ProjectGraph`
- `ScanCandidatesResult`
- `ScanSummaryResult`
- `ContextJson`

Execution/approval unions (see [Execution and approval contracts](#execution-and-approval-contracts)):

- `RiskClass`
- `ApprovalGate`
- `GrantRejection`
- `ApprovalMode`
- `RunStatus`
- `ScheduleKind`
- `SourceDeltaOp`

Storage/runtime helper types:

- `SingletonContentFile`
- `CollectionContentFile`
- `DictionaryContentFile`
- `CollectionEntry`
- `CollectionContentOutput`
- `DocumentEntry`
- `DocumentContentOutput`
- `SingletonMeta`
- `CollectionMeta`
- `DocumentMeta`
- `DictionaryMeta`

Normalize/plan types:

- `NormalizePlan`
- `NormalizePlanModel`
- `NormalizePlanExtraction`
- `NormalizePlanPatch`

Provider contracts (re-exported from `provider.ts` — implement these to add a new git backend):

- `RepoProvider`
- `RepoReader`
- `RepoWriter`
- `ProviderCapabilities`
- `FileChange`
- `CommitAuthor`
- `Commit`
- `ApplyPlanInput`
- `Branch`
- `FileDiff`
- `MergeResult` (includes optional `sync?: SyncResult` for local-worktree providers)
- `LOCAL_CAPABILITIES` (const — capability set for LocalProvider)

Git transaction types:

- `SyncResult`
- `ContentrainError`

Validate functions (pure, dependency-free):

- `validateSlug(slug)` — kebab-case slug validation
- `validateEntryId(id)` — entry ID format validation
- `validateLocale(locale, config)` — locale format + config support check
- `detectSecrets(value)` — detect potential secrets in field values (provider-shaped patterns, plus an `api_key = …` assignment whose tail passes `looksLikeCredential`)
- `validateFieldValue(value, fieldDef)` — full field schema validation (type, required, min/max, pattern, select)

Serialize functions (pure, dependency-free):

- `sortKeys(obj, fieldOrder?)` — recursive key sorting for canonical output
- `canonicalStringify(data, fieldOrder?)` — deterministic JSON serialization
- `generateEntryId()` — 12-char hex ID generation
- `parseMarkdownFrontmatter(content)` — parse YAML frontmatter + body from markdown
- `serializeMarkdownFrontmatter(data, body)` — serialize data + body into markdown frontmatter
- `parseFrontmatterScalar(raw)` / `parseFrontmatterScalarString(raw)` / `splitFrontmatterList(inner)` — the scalar grammar those two are built on, exported because a second reader needs it (see [Frontmatter round trip](#frontmatter-round-trip))

Constants:

- `CONTENTRAIN_DIR` — default `.contentrain` folder name
- `CONTENTRAIN_BRANCH` — default `contentrain` branch name for content tracking
- `PATH_PATTERNS` — file path conventions for models, content, meta. Content and meta paths both name the model: a document is `content/{domain}/{modelId}/{slug}/{locale}.md`. The patterns show the default `locale_strategy: 'file'`; a parity test in `@contentrain/mcp` holds them to what the resolvers actually produce
- `SLUG_PATTERN` — regex for valid slugs
- `ENTRY_ID_PATTERN` — regex for valid entry IDs
- `LOCALE_PATTERN` — regex for valid locale codes
- `CANONICAL_JSON` — serialization rules (indent, encoding, trailing newline, key sort)
- `SECRET_PATTERNS` — provider-shaped regex patterns for secret detection (the generic `api_key` rule lives in `detectSecrets`, gated by `looksLikeCredential`)

## Stability

This package is intended to be the shared public contract across the Contentrain ecosystem.

In practice that means:

- types exported from the package root are the public surface
- packages should depend on these shared definitions instead of redefining domain types
- breaking changes here should be treated as ecosystem-level breaking changes
- the `RepoProvider` contract enables third-party implementations without depending on `@contentrain/mcp` internals

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

## Import Style

Type-only usage:

```ts
import type { ModelDefinition, ContentrainConfig } from '@contentrain/types'
```

Mixed usage (types + runtime functions):

```ts
import type { FieldDef, ValidationError } from '@contentrain/types'
import {
  validateFieldValue,
  validateSlug,
  detectSecrets,
  canonicalStringify,
  parseMarkdownFrontmatter,
} from '@contentrain/types'
```

Provider contract usage (for custom RepoProvider implementations):

```ts
import type { RepoProvider, ProviderCapabilities } from '@contentrain/types'

export class MyCustomProvider implements RepoProvider {
  readonly capabilities: ProviderCapabilities = {
    localWorktree: false,
    sourceRead: true,
    sourceWrite: true,
    pushRemote: true,
    branchProtection: true,
    pullRequestFallback: true,
    astScan: false,
  }
  // ...implement RepoProvider methods
}
```

## Studio Integration

Studio (Nuxt 4, web) cannot import `@contentrain/mcp` directly because MCP depends on Node.js-only packages (`simple-git`, `@modelcontextprotocol/sdk`). The validate and serialize functions in this package are **pure, dependency-free, and browser-compatible** — designed for Studio to share the same validation contract as MCP.

### What Studio gets from `@contentrain/types`

| Function | Use case |
|---|---|
| `validateSlug(slug)` | Form validation for document slugs |
| `validateEntryId(id)` | Validate collection entry IDs |
| `validateLocale(locale, config)` | Locale picker validation |
| `detectSecrets(value)` | Content editor secret detection warnings |
| `validateFieldValue(value, fieldDef)` | Full field-level validation in content forms |
| `canonicalStringify(data, fieldOrder?)` | Preview canonical JSON output |
| `parseMarkdownFrontmatter(content)` | Document editor frontmatter parsing |
| `serializeMarkdownFrontmatter(data, body)` | Document editor serialization |
| `parseFrontmatterScalar(raw)` | One frontmatter scalar: booleans, null, numbers, quoted strings with escapes decoded |
| `parseFrontmatterScalarString(raw)` | The same, always as a string — a SKU of `"007"` must not become `7` |
| `splitFrontmatterList(inner)` | Split an inline array on commas outside quotes |
| `generateEntryId()` | Client-side entry ID generation |
| `SECRET_PATTERNS` | Extend or customize secret detection |
| `looksLikeCredential(tail)` | Decide whether a value assigned to an API-key setting is a credential or documentation |

### What stays in MCP (not available to Studio directly)

These require file system I/O or Node.js dependencies:

- `checkRelation()` — validates relation references against actual content files on disk
- `validateProject()` — full project validation with file reading
- `writeContent()` / `deleteContent()` — content persistence with git worktree
- `resolveContentDir()` / `resolveJsonFilePath()` — path resolution with `node:path`

### Unique constraints and relation validation

`validateFieldValue` handles schema-level checks. Two things require external state:

- **Unique constraints** — need to check across all entries (Studio should query its API/store)
- **Relation references** — need to verify target entries exist (Studio should query its content API)

These are left to Studio's server-side or API layer to implement on top of the pure validation.

## Design Role

`@contentrain/types` exists so every package in the monorepo speaks the same domain language.

Examples:

- MCP validates and writes `ModelDefinition`
- CLI reads `ContextJson`
- SDK codegen consumes `ModelDefinition` and `FieldDef`
- AI rules align with the same model and workflow vocabulary
- Studio uses the same validation functions in the browser
- Third-party providers implement `RepoProvider` to plug into MCP

This package should stay:

- small
- zero runtime dependencies
- browser + Node.js compatible
- stable
- free of package-specific behavior

## Development

From the monorepo root:

```bash
pnpm --filter @contentrain/types build
pnpm --filter @contentrain/types test
pnpm --filter @contentrain/types typecheck
```

## Related Packages

- `@contentrain/mcp`
- `contentrain`
- `@contentrain/query`
- `@contentrain/rules`

## License

MIT

## Migration contracts

Shared shapes for the WordPress → static-site migration pipeline. They exist here — in the one MIT package every side may depend on — because the documents cross repository and license boundaries: a GPL WordPress plugin produces them, a proprietary migration service consumes them, an open emitter renders from them.

| Contract | Role |
|---|---|
| `RawIR` | Source-faithful extraction of a WordPress site (posts, terms, menus, comments, media, redirects) with provenance: which access rung produced it (`rest_public` → `rest_auth` → `wxr` → `bridge`). Unresolved references are kept and marked, never dropped. |
| `CapabilityManifest` | Evidence-based inventory of what the site uses (SEO, forms, comments, i18n, ACF, …) — the input for migration planning and the "what happens to X" conversation. |
| `ProjectIR` | The reproducible model of the site: route model, layout families, component variants, query bindings, design tokens. Not "this page's HTML" — the design system that generates unseen pages correctly. |
| `MigrationHandoff` | What the migration hands the user: repository, per-capability dispositions, and offers for runtime capabilities (with cost comparison) — offering is this document's job; fulfilling is the receiving product's. `runtime` (`RuntimeBinding`) records where the generated site's runtime components were bound once an offer was fulfilled. |
| `RuntimeBinding` | The provider's public API origin (`base_url`) and `project_id` — all a static site needs to mount comments and forms. Never a credential: the public endpoints are unauthenticated by design. |

All are plain JSON (snake_case keys), stamped with `MIGRATION_CONTRACT_VERSION`.

Chrome markers the emitter honours: `CHROME_BODY_SLOT` (where page content goes), `CHROME_REPEAT_OPEN`/`CHROME_IF_OPEN` (per-item and conditional regions), `LIST_ITEMS_SLOT` (where a list section's items go) and `componentSlot(id)` (`<!--@@component:ID@@-->`, where a `ComponentDef` — a `comments` thread, a `form` — is mounted).

`ModelDefinition` can carry runtime-owned `form` and `comments` configuration.
`MODEL_EXTENSION_KEYS` identifies these preserved blocks; canonical model
serialization places them after `fields`. The content engine does not interpret
the runtime settings.

## Execution and approval contracts

`migration.ts` describes a site. `execution.ts` describes an act upon one — an
agent run, a bulk edit, a deploy, a cutover — and who had to say yes first.

Three repositories meet here and none may define these shapes for itself. The
migration engine produces plans and receipts, Studio renders the plan card and
collects approvals, and MCP is where a plan's steps execute. If each wrote its
own `RiskClass`, "destructive" would mean three different things and the
approval guarding it would be theatre.

| Contract | Role |
|---|---|
| `RiskClass` | What is at stake, as an ordered ladder: `read_only` → `low_risk_content` → `bulk_content` → `destructive_schema` → `external_effect` → `financially_material` → `deployment`. `highestRisk()` rates a plan by its worst step — a survey that ends in a deploy is a deploy. |
| `ApprovalGate` | The three distinct decision moments: `plan` (before the work, on scope and cost), `change` (on the produced diff), `release` (on production effect). Approving what will be done is not approving what was produced, and neither is permission to publish it. |
| `ApprovalRule` / `ApprovalPolicyFile` | `.contentrain/approval-policies.json` — which risk needs whose approval, in which mode (`auto` / `single` / `quorum`). In git, beside the content it governs, so the policy in force is the policy on the branch. Rules are additive: a policy file can only ever make a project stricter. |
| `ApprovalRequirement` / `ApprovalGrant` | An outstanding demand, and a decision actually given. A grant is bound to an exact `plan_hash` (and `commit_sha` for `change`): change the plan and its grants stop applying. An approval of "publish these 12 posts" must not carry over to a plan that publishes 400. |
| `ExecutionPlan` | An operation fully described before it runs: steps, union scope, risk, estimate, rollback, and the repository state it assumes. |
| `ExecutionReceipt` | What happened: status, approvals, checkpoints, verification results, measured cost, and the scope actually touched — the same `ExecutionScope` shape as the plan, so prediction and outcome can be subtracted. Release approvers are the `approvals` entries with `gate: 'release'`; read them with `approversFor()`. |
| `DeploymentTarget` | Where a build is published. Carries a `secret_ref`, never a secret — this document is written to git. |
| `AutomationDefinition` | Reserved shape for `.contentrain/automations.json`. Nothing reads it yet; it exists so the first writer does not invent a fourth vocabulary for schedules. |
| `SourceDeltaPlan` | The WordPress→repo delta — *not* `contentrain_reconcile`, which merges two git branches and knows nothing about WordPress. Carries explicit deletion tombstones, because `modified_after` is a filter on changed records and never reports a deletion, plus slug moves (which generate redirects) and semantic conflicts. `deletions_detectable: false` must not be read as "nothing was deleted". |

### The evaluator

`approval.ts` is the decision procedure over these shapes: given a plan, a
policy and the decisions collected so far, may this proceed?

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

It replaces a role check. `shouldAutoMerge` asks "is this person an owner?",
which cannot express "a bulk publish needs a second pair of eyes even from the
owner" and cannot tell a typo fix from a domain cutover. This asks about the
action: its risk, its scope, and what the project's policy says about that
combination.

Rules that matter:

- **A plan cannot understate itself.** `effectiveRisk()` takes the worst of the
  plan's declared class and its steps', so a plan labelled `read_only` that
  carries a deploy step is evaluated as a deploy.
- **Each matching rule is its own requirement and all must be met.** Merging two
  rules would need a way to combine their modes, roles and counts, and every
  such rule has a case where the result is *looser* than one of its inputs.
- **`auto` does not climb the ladder.** Every other mode covers its class and
  everything above it. If `auto` did too, one `auto` rule on a low rung would
  exempt every heavier operation above it — the one mode that demands nothing
  would become the only mode that can loosen a policy.
- **An agent never approves.** Not its own work, not anyone's. The author of a
  plan cannot approve it either unless the project sets `allow_self_approval`,
  and that setting does not extend to agents.
- **A `change` decision is a decision about a diff.** Presented with a different
  branch tip than the one reviewed, it does not count.
- **`now` is an input.** Nothing reads the clock, so a blocked run can be
  explained months later by replaying the same arguments.

Every rejected decision carries a machine-readable reason
(`plan_hash_mismatch`, `commit_mismatch`, `expired`, `agent_approver`,
`self_approval`, `role_not_permitted`, `duplicate_approver`,
`no_matching_requirement`), because the useful question is never "is it
blocked" but "I approved this, why is it still blocked".

With no `.contentrain/approval-policies.json`, `DEFAULT_APPROVAL_POLICY`
applies: read-only work proceeds, everything else wants one reviewer on the
diff. Whether a project consults the evaluator at all is still governed by its
`workflow` setting.

### `plan_hash`

`computePlanHash(plan)` is SHA-256 over `planHashPayload(plan)`: canonical JSON
(sorted keys, 2-space indent, trailing newline) of the plan's semantic fields.

Excluded from the payload: `plan_hash` itself, and `id`, `created_at`,
`created_by`, `idempotency_key` — who built a plan, when, under which run id and
with which deduplication key do not change what the plan will do, and
regenerating the same operation must produce the same hash or idempotency and
approval binding both break. Everything else is covered, so a widened scope, an
added step, a raised estimate or a withdrawn rollback each invalidate every
approval the plan had collected.

It is async because it uses Web Crypto (`crypto.subtle`), available in Node 18+,
Deno, Bun, workers and browsers alike — this package is consumed in all of them
and must not reach for `node:crypto`. A non-cryptographic hash was rejected:
approvals are pinned to this value, so a collision is an approval bypass.

The digest is reproducible from the contract alone — the test suite pins a
golden hash cross-checked against an independent canonical-JSON + SHA-256
implementation in another language.

### Reserved paths

`RESERVED_PATHS` names four files under `.contentrain/` that this repository has
claimed but does not yet write: `capabilities.json`, `automations.json`,
`approval-policies.json`, `redirects.json`. `.contentrain/` is a shared
namespace — Studio, the migration engine and a customer's own tooling all write
into it — so a name claimed here cannot later be taken for something else, and
the tools that walk the directory know these four are expected rather than
stray.

Until a tool owns one, the contract is narrow and pinned by tests in
`@contentrain/mcp`:

- `contentrain_doctor` and `contentrain_validate` ignore them completely. They
  are not orphans, not broken content, and not the validator's business.
- `contentrain_reconcile` treats each as one opaque file: it takes the side that
  changed it, and reports `file_conflict` when both sides did. It never merges
  their interiors, because it does not know their interiors — a field-level
  union on an approval policy would produce a policy nobody wrote.

## Frontmatter round trip

A document's fields live in YAML frontmatter, and two readers open them: the
content engine, through `parseMarkdownFrontmatter` (which `@contentrain/mcp`
re-exports), and `@contentrain/query`'s client generator and Astro loader. The
property both depend on is that a value written and read back is the same
value — and for four shapes it did not hold.

| Value | Came back as |
|---|---|
| `He said "Hi"` | `He said \"Hi\"` — the quotes were stripped without decoding the escapes |
| `C:\path\to` | `C:\\path\\to` — and doubling again on every further save |
| `line one`⏎`line two` | `line one` — the rest was written as frontmatter lines the reader then skipped |
| `  padded  ` | `padded` |
| `'42'` (a string) | `42` (a number) |
| `true` (a boolean) | `'true'` (a string) |

All six are fixed, and the guarantee is now explicit: **for every value
`serializeMarkdownFrontmatter` can write, `parseMarkdownFrontmatter` returns it
unchanged, and a second round trip produces identical bytes.** The second trip
is part of the test on purpose — backslash doubling only diverges on the trip
after the one that introduced it, so a single-trip test passes on content that
corrupts a little more with every export.

What that required:

- A quoted scalar's escapes are decoded (`\\`, `\"`, `\n`, `\r`, `\t`, `\uXXXX`).
  An unrecognised escape keeps its backslash rather than erroring — hand-written
  frontmatter says `"C:\Users"`, and losing that to strictness is a worse trade
  than keeping the bytes. Text that merely starts and ends with a quote
  (`"a" and "b"`) is not treated as one scalar, because slicing its ends off
  would corrupt it.
- A value carrying a newline, tab, backslash or edge whitespace is quoted and
  escaped, so it occupies one line and no part of it is silently dropped.
- A **string** that would read back as another type is quoted; a real boolean,
  number or null is not, so each reads back as itself.
- An empty array is written `key: []`. A bare `key:` is genuinely ambiguous —
  empty array, empty object, or null — and the two readers were guessing it
  differently.

The scalar grammar is exported (`parseFrontmatterScalar`,
`parseFrontmatterScalarString`, `splitFrontmatterList`) and imported by the SDK
reader rather than replicated. That is the actual fix: when each side had its
own copy, correcting one of them would have turned a shared bug into a silent
disagreement between the generated client and the content engine. A parity suite
in `@contentrain/query` asserts both readers return the same values for the same
bytes.

Body text keeps its internal blank lines; only its leading and trailing
whitespace is normalised, which is markdown behaviour rather than loss.
