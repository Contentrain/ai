// ─── Execution, Approval and Source-Delta Contracts ───
//
// Shared, MIT-licensed shapes for operations that *do* something: an agent run,
// a bulk edit, a deploy, a cutover. `migration.ts` describes a site; this file
// describes an act upon one.
//
// Three repositories meet here and none of them may define these shapes for
// itself. The migration engine (private) produces plans and receipts. Studio
// (AGPL) renders the plan card, collects approvals and stores the run. The MCP
// server (MIT) is where a plan's steps actually execute. If each wrote its own
// `RiskClass`, a "destructive" operation would mean three different things and
// the approval that guards it would be theatre.
//
// Everything here is plain JSON — snake_case keys, no class instances, no
// functions — because these documents cross process, repository and license
// boundaries, and because a plan must survive being written to disk, approved
// hours later, and executed by a different process than the one that built it.

import { canonicalStringify } from './canonical.js'

/**
 * Version stamped into every execution document (`version` field on each root).
 * A reader that sees a higher version than it knows should refuse rather than
 * guess — a misread plan is a plan executed with the wrong scope.
 */
export const EXECUTION_CONTRACT_VERSION = 1

// ─── Actors ───

/**
 * Who is acting. `kind` is load-bearing for approval: an agent may never
 * approve its own work, so the evaluator has to be able to tell an agent
 * from a person without consulting Studio's user table.
 */
export interface ActorRef {
  kind: 'human' | 'agent' | 'system'
  /** Stable identifier in the issuing system (Studio user id, agent name). */
  id: string
  /** Display name at the time of acting; advisory, never matched against. */
  name?: string
  /** Project role held at the time of acting (e.g. "owner", "admin", "editor"). */
  role?: string
}

// ─── Risk ───

/**
 * What is at stake in an operation, in ascending severity.
 *
 * The order is the contract, not a convenience: `RISK_CLASSES` is a ladder and
 * a policy written for `bulk_content` is expected to also cover everything
 * above it. The seven rungs come from the approval model — read-only work is
 * automatic, content edits follow project policy, and anything that leaves the
 * repository (money, third parties, production) is a separate decision from
 * whether the content is correct.
 */
export const RISK_CLASSES = [
  /** Reads only; no file, no side effect. Automatic by default. */
  'read_only',
  /** A bounded content edit — one entry, one locale. Project policy decides. */
  'low_risk_content',
  /** Many entries at once: bulk status changes, mass field edits, imports. */
  'bulk_content',
  /** Deletes content or changes a model's shape. Both plan and change approval. */
  'destructive_schema',
  /** Reaches a third party: email, CRM, webhook, provider API. */
  'external_effect',
  /** Spends money in a way worth a budget decision. */
  'financially_material',
  /** Publishes, deploys, cuts over, or rewrites redirects. Release approval. */
  'deployment',
] as const

export type RiskClass = (typeof RISK_CLASSES)[number]

/** Position on the ladder; higher is more severe. */
export function riskRank(risk: RiskClass): number {
  return RISK_CLASSES.indexOf(risk)
}

/**
 * The most severe of the given classes — the class a multi-step plan is
 * evaluated against. A plan is exactly as safe as its worst step, so a
 * read-only survey that ends in a deploy is a deploy.
 */
export function highestRisk(risks: readonly RiskClass[]): RiskClass {
  let worst: RiskClass = 'read_only'
  for (const risk of risks) {
    if (riskRank(risk) > riskRank(worst)) worst = risk
  }
  return worst
}

// ─── Approval ───

/**
 * The three moments at which a decision is asked for. They are distinct
 * questions and collapsing them is the mistake this type exists to prevent:
 * approving *what will be done* is not approving *what was produced*, and
 * neither is permission to put it in front of the public.
 */
export const APPROVAL_GATES = [
  /** Before the work starts: scope, cost, risk, tools, affected resources. */
  'plan',
  /** After the branch exists: semantic diff, schema change, validation output. */
  'change',
  /** Before production effect: publish, deploy, cutover, redirects, bulk delete. */
  'release',
] as const

export type ApprovalGate = (typeof APPROVAL_GATES)[number]

/**
 * How many people, and which, must say yes. Deliberately three modes: a
 * generic workflow canvas was considered and rejected — policy-based approval
 * covers every case the product actually has.
 */
export const APPROVAL_MODES = [
  /** No human decision needed. */
  'auto',
  /** One authorised reviewer is enough. */
  'single',
  /** A count, or a role combination, must be met. */
  'quorum',
] as const

export type ApprovalMode = (typeof APPROVAL_MODES)[number]

/**
 * One rule in `.contentrain/approval-policies.json`: for operations at or
 * above `risk`, this gate is required in this mode.
 *
 * Rules are additive. Every matching rule contributes a requirement; nothing a
 * rule says can remove a requirement another rule created. A policy file can
 * therefore only ever make a project stricter, which is what makes it safe to
 * merge one from a template.
 */
export interface ApprovalRule {
  /** Applies to this class and — because the classes are a ladder — everything above it. */
  risk: RiskClass
  gate: ApprovalGate
  mode: ApprovalMode
  /** Quorum only: how many distinct approvers are needed. Ignored otherwise. */
  min_approvals?: number
  /** Roles that may satisfy this rule. Empty/absent = any authorised reviewer. */
  roles?: string[]
  /** Narrow the rule to certain models. Absent = every model. */
  models?: string[]
  /** Narrow the rule to certain locales. Absent = every locale. */
  locales?: string[]
}

/**
 * `.contentrain/approval-policies.json`. Lives in git, beside the content it
 * governs, so that the policy in force is the policy on the branch — a policy
 * stored only in a database can be changed after a plan is built and before it
 * is approved.
 */
export interface ApprovalPolicyFile {
  version: number
  /**
   * Applied at the `change` gate when no rule matches at all. Absent means no
   * rule matched and therefore nothing is required — the policy's silence is
   * taken literally rather than filled in with each consumer's idea of a
   * sensible default.
   */
  default_mode?: ApprovalMode
  rules: ApprovalRule[]
  /**
   * Whether an actor may approve a plan they themselves created. Defaults to
   * false; an agent can never self-approve regardless of this setting.
   */
  allow_self_approval?: boolean
}

/**
 * An outstanding or satisfied demand for a decision, derived from a rule.
 * `because` carries the rule's risk class so a UI can say *why* a gate
 * appeared without re-running the policy.
 */
export interface ApprovalRequirement {
  gate: ApprovalGate
  mode: ApprovalMode
  /** Distinct approvers still needed; 0 once satisfied. */
  min_approvals: number
  roles?: string[]
  /** The risk class of the rule that produced this requirement. */
  because: RiskClass
}

/**
 * A decision that was actually given.
 *
 * A grant is bound to an exact `plan_hash`: if the plan changes, its grants no
 * longer apply and the gate reopens. That binding is the whole point — an
 * approval of "publish these 12 posts" must not carry over to a plan that
 * publishes 400.
 */
export interface ApprovalGrant {
  gate: ApprovalGate
  /** The plan this decision was given for. */
  plan_hash: string
  /** The branch tip reviewed, for `change` grants on a produced diff. */
  commit_sha?: string
  approver: ActorRef
  /** ISO 8601 UTC. */
  approved_at: string
  /** ISO 8601 UTC; a grant past this instant does not count. */
  expires_at?: string
  note?: string
}

// ─── Execution scope ───

/**
 * What an operation touches. Used twice with the same shape: on a plan it is
 * the prediction, on a receipt it is what actually happened. Keeping one shape
 * for both is deliberate — the diff between them is the most useful thing a
 * receipt can show, and it is only computable if the two are comparable.
 *
 * Every field is optional and an absent field means "none", not "unknown": a
 * plan that cannot enumerate what it will touch is not a plan that should be
 * approved.
 */
export interface ExecutionScope {
  models?: string[]
  locales?: string[]
  /** Entry ids, or `model:id` where the model is not implied by `models`. */
  entries?: string[]
  /** Routes/URLs affected — cutovers and redirect rewrites report these. */
  routes?: string[]
  /** Repository-relative file paths. */
  files?: string[]
  /** Asset ids or paths. */
  assets?: string[]
  /** Provider identifiers reached (deployment, email, CRM). */
  providers?: string[]
  /** Hosts contacted outside the project — the evidence behind `external_effect`. */
  external_domains?: string[]
}

/** One tool invocation inside a plan. */
export interface ExecutionStep {
  id: string
  /** Tool name as the runner knows it (e.g. "contentrain_bulk"). */
  tool: string
  /** One line, written for the person approving, not for the log. */
  summary: string
  risk: RiskClass
  /** What this step alone touches; the plan's scope is the union. */
  scope?: ExecutionScope
  /** Opaque tool arguments. Hashed with the rest of the plan. */
  input?: Record<string, unknown>
}

/** Predicted cost. Currency is ISO 4217; absent means the cost is not monetary. */
export interface ExecutionEstimate {
  currency?: string
  /** Money, in major units. */
  cost?: number
  /** Model tokens, when the step runs an agent. */
  tokens?: number
  duration_ms?: number
  /** Items the operation expects to write — entries, files, assets. */
  items?: number
}

/** Cost as measured. Same shape as the estimate so the two can be subtracted. */
export type ExecutionCost = ExecutionEstimate

/**
 * How to undo the operation. A command, not a promise: if the runner cannot
 * state the undo, `available` is false and the approver learns that *before*
 * deciding rather than after failing.
 */
export interface RollbackPlan {
  available: boolean
  /** Shell command or tool call that reverses the effect. */
  command?: string
  /** Commit to reset the content branch to. */
  revert_to?: string
  /** Why it cannot be undone, when `available` is false. */
  reason?: string
}

/** The repository state a plan was built against. */
export interface ProjectRef {
  branch?: string
  commit_sha?: string
  /** Content branch tip, when it differs from the base branch. */
  content_commit_sha?: string
}

/**
 * An operation, fully described, before it runs.
 *
 * `plan_hash` is the identity of *what will happen*. It covers the steps,
 * scope, risk, estimate and rollback, and excludes who built the plan and
 * when — regenerating the same operation must produce the same hash, or
 * idempotency and approval binding both break. Compute it with
 * {@link computePlanHash}; never hand-roll it, because a hash computed two
 * different ways is a gate that silently opens.
 */
export interface ExecutionPlan {
  version: number
  id: string
  /** SHA-256 of the plan's semantic payload — see {@link computePlanHash}. */
  plan_hash: string
  /** What this achieves, in the requester's words. */
  intent: string
  /** The plan's class: the highest risk among its steps. */
  risk: RiskClass
  steps: ExecutionStep[]
  /** Union of the steps' scopes, stated once so an approver reads one list. */
  scope: ExecutionScope
  estimate?: ExecutionEstimate
  rollback?: RollbackPlan
  /** Repository state the plan assumes; re-checked at execution time. */
  project?: ProjectRef
  /** ISO 8601 UTC. Excluded from the hash. */
  created_at?: string
  /** Excluded from the hash, but checked for self-approval. */
  created_by?: ActorRef
  /** ISO 8601 UTC; a plan past this instant must be rebuilt, not run. */
  expires_at?: string
  /**
   * Caller-supplied key that makes a re-submission a no-op rather than a
   * second run. Excluded from the hash: two runs of the same work differ by
   * this key alone and must still share a plan hash.
   */
  idempotency_key?: string
}

// ─── Receipt ───

/**
 * Run lifecycle. The main line is `draft → planned → awaiting_approval →
 * approved → scheduled → queued → running → verifying → completed`; the rest
 * are the states a run can sit in when something interrupts it.
 */
export const RUN_STATUSES = [
  'draft',
  'planned',
  'awaiting_approval',
  'approved',
  'scheduled',
  'queued',
  'running',
  'verifying',
  'completed',
  'paused',
  'needs_attention',
  'retrying',
  'failed',
  'cancelled',
  'expired',
  'rolled_back',
] as const

export type RunStatus = (typeof RUN_STATUSES)[number]

/** Statuses from which a run will not proceed on its own. */
export const TERMINAL_RUN_STATUSES = [
  'completed',
  'failed',
  'cancelled',
  'expired',
  'rolled_back',
] as const satisfies readonly RunStatus[]

export function isTerminalRunStatus(status: RunStatus): boolean {
  return (TERMINAL_RUN_STATUSES as readonly RunStatus[]).includes(status)
}

/**
 * A step boundary the runner survived. Checkpoints are what make a resumed
 * run skip work it already did instead of repeating it.
 */
export interface Checkpoint {
  step_id: string
  status: 'completed' | 'skipped' | 'failed'
  /** ISO 8601 UTC. */
  at: string
  /** What this step actually touched. */
  scope?: ExecutionScope
  /** Commit written by this step, when it wrote one. */
  commit_sha?: string
  message?: string
}

/** One post-run assertion — a build, a link check, a parity score. */
export interface VerificationCheck {
  id: string
  /** One line naming what was asserted. */
  name: string
  passed: boolean
  /** Measured value, when the check produced one. */
  value?: number | string
  /** Threshold the value was compared against. */
  expected?: number | string
  detail?: string
}

/**
 * What happened, after the fact. The receipt is the durable record: it
 * survives the run, is exported for audit, and is the only artefact that can
 * answer "who allowed this and what did it actually change?".
 *
 * Release approvers are the entries of `approvals` whose `gate` is `release`
 * — there is deliberately no separate `release_approved_by` field, because two
 * places recording the same fact is two places that can disagree. Read them
 * with {@link approversFor}.
 */
export interface ExecutionReceipt {
  version: number
  id: string
  plan_id: string
  /** The plan that ran. Must match the approvals' `plan_hash`. */
  plan_hash: string
  status: RunStatus
  actor: ActorRef
  /** Every decision that permitted this run, plan/change/release alike. */
  approvals?: ApprovalGrant[]
  /** ISO 8601 UTC. */
  started_at: string
  finished_at?: string
  /** What was actually touched — compare against the plan's `scope`. */
  applied: ExecutionScope
  checkpoints?: Checkpoint[]
  verification?: VerificationCheck[]
  /** Measured cost — compare against the plan's `estimate`. */
  cost?: ExecutionCost
  /** The undo, as it stands now that the run has happened. */
  rollback?: RollbackPlan
  /** Repository state the run left behind. */
  project?: ProjectRef
  /** Set when `status` is `failed` or `needs_attention`. */
  error?: { code: string, message: string, step_id?: string }
}

/** Approvers recorded on a receipt for one gate, in grant order. */
export function approversFor(receipt: ExecutionReceipt, gate: ApprovalGate): ActorRef[] {
  return (receipt.approvals ?? []).filter(grant => grant.gate === gate).map(grant => grant.approver)
}

// ─── Deployment ───

/**
 * Where a build is published. Carries a *reference* to a secret, never a
 * secret: this document is written to git, and a token in git is a token
 * leaked. The reference is resolved at execution time by whoever holds the
 * vault.
 */
export interface DeploymentTarget {
  id: string
  /** Provider identity (e.g. "netlify", "vercel", "cloudflare-pages"). */
  provider: string
  /** Provider-side site/project identifier. */
  site_id?: string
  branch?: string
  /** Key naming the credential in the executing side's secret store. */
  secret_ref?: string
  /** Non-secret provider settings. */
  config?: Record<string, string>
}

// ─── Automation (type reservation) ───
//
// Reserved now so that the file `.contentrain/automations.json` has a declared
// shape before anything writes one. No tool in this repository reads these
// yet; the shape exists so that the first writer does not invent a fourth
// vocabulary for schedules.

export const SCHEDULE_KINDS = [
  'once',
  'recurring',
  'content_event',
  'git_event',
  'runtime_event',
  'external_webhook',
  'manual',
] as const

export type ScheduleKind = (typeof SCHEDULE_KINDS)[number]

/** What to do with an occurrence that was missed while the runner was down. */
export type MisfirePolicy = 'skip' | 'run_once' | 'run_all'

export interface AutomationSchedule {
  kind: ScheduleKind
  /** ISO 8601 UTC, for `once`. */
  at?: string
  /** Cron expression, for `recurring`. */
  cron?: string
  /** IANA zone (e.g. "Europe/Istanbul"); cron without one is ambiguous twice a year. */
  timezone?: string
  /** Event name, for the event kinds. */
  event?: string
  misfire?: MisfirePolicy
}

export interface AutomationDefinition {
  version: number
  id: string
  name: string
  enabled: boolean
  schedule: AutomationSchedule
  /** What the run should do, in the requester's words. */
  intent: string
  /** Risk the automation declares; the policy is re-evaluated at fire time. */
  risk?: RiskClass
  /** Budget ceiling per occurrence. */
  budget?: ExecutionEstimate
  /** Deduplication key for the occurrence. */
  idempotency_key?: string
  /** Bounded retry; absent means no retry. */
  max_retries?: number
}

// ─── SourceDeltaPlan ───
//
// The WordPress→repo delta layer. This is NOT `contentrain_reconcile`: that
// tool merges two git branches through their common ancestor and knows
// nothing about WordPress. A source delta is the other axis — what changed at
// the origin since the snapshot the repository was built from — and it must be
// written to the repository *before* reconcile runs on the git side.
//
// The trap this shape exists to close: `modified_after` is a filter on changed
// records, not a deletion feed. A post deleted in WordPress simply stops
// appearing, and a delta built from "what changed" will never notice. Hence
// explicit tombstones, produced by comparing inventories rather than by
// reading a feed.

/** The origin state a delta is measured from. */
export interface SourceCursor {
  kind: 'rest_modified_after' | 'wxr_export' | 'bridge_inventory'
  /** ISO 8601 UTC, for `rest_modified_after`. */
  modified_after?: string
  /** Export identifier, for `wxr_export`. */
  export_id?: string
  /** Inventory hash, for `bridge_inventory` — the only kind that can prove deletions. */
  inventory_hash?: string
  /** ISO 8601 UTC time the cursor was taken (T0). */
  taken_at: string
}

export const SOURCE_DELTA_OPS = [
  /** Present at the origin, absent in the repository. */
  'created',
  /** Present in both, origin's fingerprint changed. */
  'updated',
  /** Absent at the origin, present in the repository — a tombstone. */
  'deleted',
  /** Same record, different slug/permalink. Drives redirect generation. */
  'moved',
] as const

export type SourceDeltaOp = (typeof SOURCE_DELTA_OPS)[number]

/**
 * One record's delta.
 *
 * `conflict` is the case that cannot be resolved mechanically: the same record
 * changed at the origin *and* in the repository since the cursor. Taking
 * either side silently loses an edit, so the plan reports it and a human
 * decides.
 */
export interface SourceDeltaEntry {
  op: SourceDeltaOp
  /** Origin identifier (WordPress post/term/attachment id). */
  wp_id: number
  /** Origin object type (e.g. "post", "page", "attachment", "category"). */
  wp_type?: string
  /** Where it lives in the store, when it is already mapped. */
  model?: string
  entry_id?: string
  locale?: string
  /** Origin content fingerprint at cursor time and now. */
  fingerprint_before?: string
  fingerprint_after?: string
  /** For `moved`: the slugs, in that order. Redirects are generated from these. */
  slug_before?: string
  slug_after?: string
  /** True when the repository also changed this record since the cursor. */
  conflict?: boolean
  /** Why this entry is here, for the person reading the plan. */
  detail?: string
}

/**
 * A one-way transfer plan from the WordPress origin to the repository.
 *
 * Not a sync: there is no path back. The plan is produced, written, and only
 * then does `contentrain_reconcile` merge the result on the git side.
 */
export interface SourceDeltaPlan {
  version: number
  /** ISO 8601 UTC. */
  generated_at: string
  /** Origin state this delta is measured from. */
  cursor: SourceCursor
  /** Origin state this delta brings the repository up to. */
  next_cursor?: SourceCursor
  entries: SourceDeltaEntry[]
  /**
   * Whether deletions could be determined at all. A `rest_modified_after`
   * cursor cannot see them; a plan that says `false` must not be read as
   * "nothing was deleted".
   */
  deletions_detectable: boolean
  /** Redirects implied by the `moved` entries. */
  redirects?: { from: string, to: string, status: 301 | 302 | 307 | 308 }[]
  /** Human-facing notes: truncation, skipped types, coverage limits. */
  warnings?: string[]
}

// ─── Plan hash ───

/**
 * The exact bytes `plan_hash` is computed over. Exposed because a hash is only
 * useful if a disagreement can be investigated: when two sides compute
 * different hashes for the same plan, comparing payloads shows which field
 * differs, and comparing hashes shows nothing.
 *
 * Excluded: `plan_hash` itself (it cannot cover itself), and `id`,
 * `created_at`, `created_by` and `idempotency_key` — who built a plan, when,
 * under which run id, and with which deduplication key do not change what the
 * plan will do. Everything else is covered, so a changed step, a widened
 * scope, a raised estimate or a withdrawn rollback all invalidate every
 * approval the plan had collected.
 */
export function planHashPayload(plan: ExecutionPlan): string {
  const { plan_hash: _hash, id: _id, created_at: _at, created_by: _by, idempotency_key: _key, ...semantic } = plan
  return canonicalStringify(semantic)
}

/**
 * SHA-256 of {@link planHashPayload}, lowercase hex.
 *
 * Async because it uses Web Crypto (`globalThis.crypto.subtle`), which is
 * available in Node 18+, Deno, Bun, workers and browsers alike — this package
 * is consumed in all of them and must not reach for `node:crypto`. A non-
 * cryptographic hash was considered and rejected: approvals are pinned to this
 * value, so a collision is an approval bypass, not a cache miss.
 */
export async function computePlanHash(plan: ExecutionPlan): Promise<string> {
  const bytes = new TextEncoder().encode(planHashPayload(plan))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}
