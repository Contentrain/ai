// ─── Approval Evaluator ───
//
// The decision procedure behind `execution.ts`'s approval types: given a plan,
// a policy and the decisions collected so far, may this proceed?
//
// It replaces a role check. Studio's `shouldAutoMerge` asks "is this person an
// owner?" — which cannot express "a bulk publish needs a second pair of eyes
// even from the owner", and cannot distinguish fixing a typo from cutting over
// a domain. This asks about the action instead: its risk, its scope, and what
// the project's own policy says about that combination.
//
// Pure and dependency-free, so the same answer comes out in Studio's server,
// in a CLI, and in a test. Nothing here reads a file, a clock or a user table:
// every input is passed in, `now` included, because a decision that silently
// depends on the wall clock cannot be reproduced when someone asks why a run
// was blocked.

import type {
  ActorRef,
  ApprovalGrant,
  ApprovalMode,
  ApprovalPolicyFile,
  ApprovalRequirement,
  ApprovalRule,
  ExecutionPlan,
  RiskClass,
} from './execution.js'
import { APPROVAL_GATES, highestRisk, riskRank } from './execution.js'

/**
 * Used when a project has no `.contentrain/approval-policies.json`.
 *
 * Read-only work proceeds; everything else wants one reviewer on the produced
 * diff. Deliberately stated as a value rather than buried in the evaluator so
 * a project can inspect it, extend it, or reject it — and so "what happens
 * without a policy file" has one answer instead of one per caller.
 *
 * Note this is a *default*, not the only gate in the system: whether a project
 * consults the evaluator at all is still governed by its `workflow` setting.
 */
export const DEFAULT_APPROVAL_POLICY: ApprovalPolicyFile = {
  version: 1,
  rules: [
    { risk: 'low_risk_content', gate: 'change', mode: 'single' },
  ],
}

/** Ascending strictness — used to keep the stricter of two modes. */
const MODE_RANK: Record<ApprovalMode, number> = { auto: 0, single: 1, quorum: 2 }

/** How many distinct approvers a mode asks for. */
function approvalsNeeded(rule: ApprovalRule): number {
  if (rule.mode === 'auto') return 0
  if (rule.mode === 'single') return 1
  return Math.max(1, rule.min_approvals ?? 2)
}

/**
 * Why a grant did not count. Machine-readable because the useful question is
 * never "is it blocked" but "I approved this, why is it still blocked".
 */
export type GrantRejection =
  /** Given for a different plan — the plan changed after the decision. */
  | 'plan_hash_mismatch'
  /** A `change` grant reviewed a different branch tip than the one presented. */
  | 'commit_mismatch'
  /** Past its `expires_at`. */
  | 'expired'
  /** An agent cannot approve. */
  | 'agent_approver'
  /** The approver authored the plan and the policy forbids self-approval. */
  | 'self_approval'
  /** The approver's role is not one the rule accepts. */
  | 'role_not_permitted'
  /** This approver already counted toward the requirement. */
  | 'duplicate_approver'
  /** No requirement at this gate — nothing for the grant to satisfy. */
  | 'no_matching_requirement'

export interface RejectedGrant {
  grant: ApprovalGrant
  reason: GrantRejection
}

/** A requirement plus the decisions that have accumulated against it. */
export interface ApprovalStatus extends ApprovalRequirement {
  /** Distinct approvers counted so far, in grant order. */
  approvers: ActorRef[]
  /** Still needed; 0 means satisfied. */
  remaining: number
}

export interface ApprovalDecision {
  /** Every requirement is satisfied and the plan has not expired. */
  allowed: boolean
  /** The class the plan was evaluated at — its own, or its worst step's. */
  risk: RiskClass
  /** Every requirement the policy produced, satisfied or not. */
  requirements: ApprovalStatus[]
  /** The subset still needing approvers, in gate order. */
  outstanding: ApprovalStatus[]
  /** Decisions that were supplied but did not count, each with a reason. */
  rejected_grants: RejectedGrant[]
  /** One line per reason the plan cannot proceed; empty when it can. */
  reasons: string[]
}

export interface ApprovalEvaluation {
  plan: ExecutionPlan
  /** Absent falls back to {@link DEFAULT_APPROVAL_POLICY}. */
  policy?: ApprovalPolicyFile
  /** Decisions collected so far. */
  grants?: readonly ApprovalGrant[]
  /**
   * The branch tip being presented for a `change` decision. When given, a
   * `change` grant must name this commit: a review of an older tip is not a
   * review of what is about to merge. When absent, `change` grants are matched
   * on `plan_hash` alone.
   */
  commit_sha?: string
  /** ISO 8601 UTC. Passed in, never read from the clock. */
  now?: string
}

/** Whether a rule's narrowing clauses match what the plan touches. */
function ruleMatchesScope(rule: ApprovalRule, plan: ExecutionPlan): boolean {
  if (rule.models && rule.models.length > 0) {
    const touched = plan.scope.models ?? []
    if (!rule.models.some(model => touched.includes(model))) return false
  }
  if (rule.locales && rule.locales.length > 0) {
    const touched = plan.scope.locales ?? []
    if (!rule.locales.some(locale => touched.includes(locale))) return false
  }
  return true
}

/**
 * The class a plan is judged at: its declared risk, or its worst step's if
 * that is higher. A plan cannot understate itself — declaring `read_only`
 * while carrying a deploy step would otherwise walk straight past the policy.
 */
export function effectiveRisk(plan: ExecutionPlan): RiskClass {
  return highestRisk([plan.risk, ...plan.steps.map(step => step.risk)])
}

/**
 * The requirements a policy produces for a plan, before any decision is
 * collected. This is what a plan card renders: "this needs one reviewer on the
 * diff and two on release, because it deploys".
 *
 * Each matching rule contributes its own requirement and all of them must be
 * met. Merging two rules into one would need a rule for combining their modes,
 * roles and counts — and every such rule has a case where the result is
 * *looser* than one of its inputs. Keeping them separate is what makes the
 * policy additive in fact and not just in intent.
 *
 * `auto` rules are dropped rather than kept as zero-approver requirements: a
 * requirement nobody has to satisfy is noise on the card, and a stricter rule
 * matching the same gate still stands on its own.
 */
export function requiredApprovals(plan: ExecutionPlan, policy: ApprovalPolicyFile = DEFAULT_APPROVAL_POLICY): ApprovalRequirement[] {
  const risk = effectiveRisk(plan)
  const requirements: ApprovalRequirement[] = []
  let matched = false

  for (const rule of policy.rules) {
    if (!ruleMatchesScope(rule, plan)) continue

    // A demanding rule covers its own class and everything above it: the
    // classes are a ladder, so a policy written for `bulk_content` also
    // governs a deploy.
    //
    // An `auto` rule does NOT climb. It says "this class needs nothing", and
    // if it inherited upward a single `auto` rule on a low rung would exempt
    // every heavier operation above it — turning the one mode that demands
    // nothing into the only mode that can loosen a policy. Matching its own
    // class alone keeps the file additive in fact and not just in intent.
    const climbs = rule.mode !== 'auto'
    const applies = climbs ? riskRank(risk) >= riskRank(rule.risk) : risk === rule.risk
    if (!applies) continue

    matched = true
    const min_approvals = approvalsNeeded(rule)
    // `auto` produces no requirement — but it did match, so the policy's
    // `default_mode` does not step in behind it.
    if (min_approvals === 0) continue

    requirements.push({
      gate: rule.gate,
      mode: rule.mode,
      min_approvals,
      ...(rule.roles && rule.roles.length > 0 ? { roles: [...rule.roles] } : {}),
      because: rule.risk,
    })
  }

  if (!matched && policy.default_mode && policy.default_mode !== 'auto') {
    requirements.push({
      gate: 'change',
      mode: policy.default_mode,
      min_approvals: approvalsNeeded({ risk, gate: 'change', mode: policy.default_mode }),
      because: risk,
    })
  }

  // Gate order, then the strictest first within a gate, so a card reads
  // chronologically and the heaviest demand is not buried.
  return requirements.toSorted((a, b) =>
    APPROVAL_GATES.indexOf(a.gate) - APPROVAL_GATES.indexOf(b.gate)
    || MODE_RANK[b.mode] - MODE_RANK[a.mode]
    || b.min_approvals - a.min_approvals)
}

/** Whether a grant may be counted at all, independent of any requirement. */
function grantDisqualification(
  grant: ApprovalGrant,
  plan: ExecutionPlan,
  policy: ApprovalPolicyFile,
  commit_sha: string | undefined,
  now: string,
): GrantRejection | undefined {
  if (grant.plan_hash !== plan.plan_hash) return 'plan_hash_mismatch'
  if (grant.expires_at && grant.expires_at <= now) return 'expired'
  // An agent may never approve — not its own work, not anyone's. The whole
  // point of the gate is that something outside the automation looked.
  if (grant.approver.kind === 'agent') return 'agent_approver'
  if (
    !policy.allow_self_approval
    && plan.created_by
    && grant.approver.id === plan.created_by.id
    && grant.approver.kind === plan.created_by.kind
  ) return 'self_approval'
  // A `change` decision is a decision about a diff. Presented with a different
  // tip than the one reviewed, it says nothing about what is about to merge.
  if (grant.gate === 'change' && commit_sha && grant.commit_sha !== commit_sha) return 'commit_mismatch'
  return undefined
}

/**
 * May this plan proceed?
 *
 * Answers with the full picture rather than a boolean: which requirements
 * exist, which are met, who met them, and — for every decision that was
 * supplied but did not count — why it did not. The last part is what makes
 * "I approved this, why is it still blocked?" answerable without reading the
 * evaluator's source.
 */
export function evaluateApproval(input: ApprovalEvaluation): ApprovalDecision {
  const { plan, commit_sha } = input
  const policy = input.policy ?? DEFAULT_APPROVAL_POLICY
  const grants = input.grants ?? []
  const now = input.now ?? new Date().toISOString()

  const risk = effectiveRisk(plan)
  // `requiredApprovals` builds fresh objects (roles included) on every call, so
  // completing them in place is safe and costs no second allocation.
  const requirements: ApprovalStatus[] = requiredApprovals(plan, policy).map(requirement =>
    Object.assign(requirement, { approvers: [] as ActorRef[], remaining: requirement.min_approvals }))

  const rejected_grants: RejectedGrant[] = []

  for (const grant of grants) {
    const disqualified = grantDisqualification(grant, plan, policy, commit_sha, now)
    if (disqualified) {
      rejected_grants.push({ grant, reason: disqualified })
      continue
    }

    // One decision can satisfy several requirements at the same gate — it is
    // the same person saying yes to the same thing once.
    let counted = false
    let sawGate = false
    let roleBlocked = false
    let duplicate = false

    for (const requirement of requirements) {
      if (requirement.gate !== grant.gate) continue
      sawGate = true
      if (requirement.roles && !requirement.roles.includes(grant.approver.role ?? '')) {
        roleBlocked = true
        continue
      }
      if (requirement.approvers.some(approver => approver.id === grant.approver.id)) {
        duplicate = true
        continue
      }
      requirement.approvers.push(grant.approver)
      requirement.remaining = Math.max(0, requirement.min_approvals - requirement.approvers.length)
      counted = true
    }

    if (counted) continue
    if (!sawGate) rejected_grants.push({ grant, reason: 'no_matching_requirement' })
    else if (duplicate) rejected_grants.push({ grant, reason: 'duplicate_approver' })
    else if (roleBlocked) rejected_grants.push({ grant, reason: 'role_not_permitted' })
  }

  const outstanding = requirements.filter(requirement => requirement.remaining > 0)
  const reasons: string[] = []

  const expired = Boolean(plan.expires_at && plan.expires_at <= now)
  if (expired) {
    reasons.push(`The plan expired at ${plan.expires_at}; rebuild it rather than running it.`)
  }

  for (const requirement of outstanding) {
    const who = requirement.roles ? ` from ${requirement.roles.join(' or ')}` : ''
    const have = requirement.approvers.length
    reasons.push(
      `${requirement.gate} approval: ${requirement.remaining} more${who} needed `
      + `(${have}/${requirement.min_approvals}), because the plan is ${requirement.because}.`,
    )
  }

  return {
    allowed: !expired && outstanding.length === 0,
    risk,
    requirements,
    outstanding,
    rejected_grants,
    reasons,
  }
}
