import { describe, it, expect } from 'vitest'
import type {
  ActorRef,
  ApprovalGrant,
  ApprovalPolicyFile,
  ExecutionPlan,
  ExecutionStep,
} from './index'
import {
  DEFAULT_APPROVAL_POLICY,
  EXECUTION_CONTRACT_VERSION,
  effectiveRisk,
  evaluateApproval,
  requiredApprovals,
} from './index'

const NOW = '2026-09-11T12:00:00Z'

const agent: ActorRef = { kind: 'agent', id: 'claude', name: 'Claude' }
const owner: ActorRef = { kind: 'human', id: 'u_owner', name: 'Ada', role: 'owner' }
const admin: ActorRef = { kind: 'human', id: 'u_admin', name: 'Grace', role: 'admin' }
const editor: ActorRef = { kind: 'human', id: 'u_editor', name: 'Kay', role: 'editor' }

function makePlan(over: Partial<ExecutionPlan> = {}): ExecutionPlan {
  const steps: ExecutionStep[] = over.steps ?? [
    { id: 's1', tool: 'contentrain_bulk', summary: 'Publish 12 posts', risk: 'bulk_content' },
  ]
  return {
    version: EXECUTION_CONTRACT_VERSION,
    id: 'run_1',
    plan_hash: 'hash_a',
    intent: 'Publish the reviewed posts',
    risk: 'bulk_content',
    scope: { models: ['blog-post'], locales: ['en'] },
    created_by: agent,
    ...over,
    steps,
  }
}

function grant(over: Partial<ApprovalGrant> & Pick<ApprovalGrant, 'approver'>): ApprovalGrant {
  return {
    gate: 'change',
    plan_hash: 'hash_a',
    approved_at: '2026-09-11T11:00:00Z',
    ...over,
  }
}

const evaluate = (plan: ExecutionPlan, over: Partial<Parameters<typeof evaluateApproval>[0]> = {}) =>
  evaluateApproval({ plan, now: NOW, ...over })

// ─── Effective risk ───

describe('effectiveRisk', () => {
  it('is the plan class when the steps agree', () => {
    expect(effectiveRisk(makePlan())).toBe('bulk_content')
  })

  it('a plan cannot understate itself', () => {
    const understated = makePlan({
      risk: 'read_only',
      steps: [
        { id: 's1', tool: 'survey', summary: 'Count entries', risk: 'read_only' },
        { id: 's2', tool: 'deploy', summary: 'Ship it', risk: 'deployment' },
      ],
    })
    expect(understated.risk).toBe('read_only')
    expect(effectiveRisk(understated)).toBe('deployment')
    // And the policy is applied at the real class, not the declared one.
    expect(evaluate(understated).risk).toBe('deployment')
  })
})

// ─── Default policy ───

describe('the default policy', () => {
  it('lets read-only work through with nothing to satisfy', () => {
    const plan = makePlan({ risk: 'read_only', steps: [{ id: 's1', tool: 'list', summary: 'List entries', risk: 'read_only' }] })
    const decision = evaluate(plan)
    expect(decision.allowed).toBe(true)
    expect(decision.requirements).toEqual([])
    expect(decision.reasons).toEqual([])
  })

  it('asks for one reviewer on the diff for anything above it', () => {
    const decision = evaluate(makePlan())
    expect(decision.allowed).toBe(false)
    expect(decision.outstanding).toHaveLength(1)
    expect(decision.outstanding[0]).toMatchObject({ gate: 'change', mode: 'single', min_approvals: 1, remaining: 1 })
    expect(decision.reasons[0]).toContain('change approval')
  })

  it('is used when no policy is supplied at all', () => {
    expect(requiredApprovals(makePlan())).toEqual(requiredApprovals(makePlan(), DEFAULT_APPROVAL_POLICY))
  })
})

// ─── Ladder ───

describe('the risk ladder', () => {
  const policy: ApprovalPolicyFile = {
    version: 1,
    rules: [{ risk: 'bulk_content', gate: 'change', mode: 'single' }],
  }

  it('a rule covers everything above its class', () => {
    for (const risk of ['bulk_content', 'destructive_schema', 'external_effect', 'deployment'] as const) {
      const plan = makePlan({ risk, steps: [{ id: 's1', tool: 't', summary: 's', risk }] })
      expect(requiredApprovals(plan, policy), risk).toHaveLength(1)
    }
  })

  it('and nothing below it', () => {
    for (const risk of ['read_only', 'low_risk_content'] as const) {
      const plan = makePlan({ risk, steps: [{ id: 's1', tool: 't', summary: 's', risk }] })
      expect(requiredApprovals(plan, policy), risk).toEqual([])
    }
  })

  /**
   * The one asymmetry in the ladder, and the reason it exists: if `auto`
   * climbed like every other mode, a single `auto` rule on a low rung would
   * exempt every heavier operation above it — the one mode that demands
   * nothing would become the only mode that can loosen a policy.
   */
  it('an auto rule does not climb it', () => {
    const withAuto: ApprovalPolicyFile = {
      version: 1,
      rules: [
        { risk: 'low_risk_content', gate: 'change', mode: 'auto' },
        { risk: 'bulk_content', gate: 'change', mode: 'single' },
      ],
    }
    const lowRisk = makePlan({ risk: 'low_risk_content', steps: [{ id: 's1', tool: 't', summary: 's', risk: 'low_risk_content' }] })
    expect(requiredApprovals(lowRisk, withAuto)).toEqual([])

    // A deploy is above both rules. The `auto` one must not reach it.
    const deploy = makePlan({ risk: 'deployment', steps: [{ id: 's1', tool: 'deploy', summary: 's', risk: 'deployment' }] })
    expect(requiredApprovals(deploy, withAuto)).toHaveLength(1)
    expect(requiredApprovals(deploy, withAuto)[0]).toMatchObject({ gate: 'change', mode: 'single' })
  })
})

// ─── default_mode ───

describe('default_mode', () => {
  it('steps in when no rule matched', () => {
    const policy: ApprovalPolicyFile = {
      version: 1,
      default_mode: 'quorum',
      rules: [{ risk: 'deployment', gate: 'release', mode: 'single' }],
    }
    const plan = makePlan() // bulk_content — below the only rule
    const requirements = requiredApprovals(plan, policy)
    expect(requirements).toHaveLength(1)
    expect(requirements[0]).toMatchObject({ gate: 'change', mode: 'quorum', min_approvals: 2, because: 'bulk_content' })
  })

  it('does not step in behind a rule that matched and chose auto', () => {
    const policy: ApprovalPolicyFile = {
      version: 1,
      default_mode: 'single',
      rules: [{ risk: 'bulk_content', gate: 'change', mode: 'auto' }],
    }
    expect(requiredApprovals(makePlan(), policy)).toEqual([])
  })

  it('silence means nothing is required, not a guessed default', () => {
    const policy: ApprovalPolicyFile = { version: 1, rules: [] }
    const decision = evaluate(makePlan(), { policy })
    expect(decision.allowed).toBe(true)
    expect(decision.requirements).toEqual([])
  })
})

// ─── Scope narrowing ───

describe('scope narrowing', () => {
  const policy: ApprovalPolicyFile = {
    version: 1,
    rules: [{ risk: 'low_risk_content', gate: 'change', mode: 'single', models: ['pricing'] }],
  }

  it('applies only to the models it names', () => {
    expect(requiredApprovals(makePlan({ scope: { models: ['blog-post'] } }), policy)).toEqual([])
    expect(requiredApprovals(makePlan({ scope: { models: ['pricing'] } }), policy)).toHaveLength(1)
    expect(requiredApprovals(makePlan({ scope: { models: ['blog-post', 'pricing'] } }), policy)).toHaveLength(1)
  })

  it('narrows by locale the same way', () => {
    const byLocale: ApprovalPolicyFile = {
      version: 1,
      rules: [{ risk: 'low_risk_content', gate: 'change', mode: 'single', locales: ['de'] }],
    }
    expect(requiredApprovals(makePlan({ scope: { locales: ['en'] } }), byLocale)).toEqual([])
    expect(requiredApprovals(makePlan({ scope: { locales: ['en', 'de'] } }), byLocale)).toHaveLength(1)
  })
})

// ─── Additivity ───

describe('rules are additive', () => {
  const policy: ApprovalPolicyFile = {
    version: 1,
    rules: [
      { risk: 'bulk_content', gate: 'change', mode: 'single' },
      { risk: 'bulk_content', gate: 'change', mode: 'quorum', min_approvals: 2, roles: ['owner'] },
      { risk: 'deployment', gate: 'release', mode: 'quorum', min_approvals: 2 },
    ],
  }
  const deploy = makePlan({ risk: 'deployment', steps: [{ id: 's1', tool: 'deploy', summary: 's', risk: 'deployment' }] })

  it('keeps each matching rule as its own requirement', () => {
    expect(requiredApprovals(deploy, policy)).toHaveLength(3)
  })

  it('orders them by gate, strictest first inside a gate', () => {
    const requirements = requiredApprovals(deploy, policy)
    expect(requirements.map(r => r.gate)).toEqual(['change', 'change', 'release'])
    expect(requirements[0]!.mode).toBe('quorum')
    expect(requirements[1]!.mode).toBe('single')
  })

  it('lets one decision count toward every requirement it qualifies for', () => {
    const decision = evaluate(deploy, { policy, grants: [grant({ approver: owner })] })
    // The owner satisfies the roleless `single` rule and counts once toward
    // the owner-only quorum — one person saying yes once, to one thing.
    const change = decision.requirements.filter(r => r.gate === 'change')
    expect(change.find(r => r.mode === 'single')!.remaining).toBe(0)
    expect(change.find(r => r.mode === 'quorum')!.remaining).toBe(1)
    expect(decision.rejected_grants).toEqual([])
    expect(decision.allowed).toBe(false)
  })

  it('is allowed only when every requirement is met', () => {
    const decision = evaluate(deploy, {
      policy,
      grants: [
        grant({ approver: owner }),
        grant({ approver: admin }),
        grant({ approver: owner, gate: 'release' }),
        grant({ approver: admin, gate: 'release' }),
      ],
    })
    // The owner-only quorum still wants a second *owner*; admin does not qualify.
    expect(decision.allowed).toBe(false)
    expect(decision.outstanding).toHaveLength(1)
    expect(decision.outstanding[0]!.roles).toEqual(['owner'])

    const second: ActorRef = { kind: 'human', id: 'u_owner2', role: 'owner' }
    const done = evaluate(deploy, {
      policy,
      grants: [
        grant({ approver: owner }),
        grant({ approver: second }),
        grant({ approver: owner, gate: 'release' }),
        grant({ approver: admin, gate: 'release' }),
      ],
    })
    expect(done.allowed).toBe(true)
    expect(done.outstanding).toEqual([])
    expect(done.reasons).toEqual([])
  })
})

// ─── Grants that do not count ───

describe('a grant that does not count says why', () => {
  const policy: ApprovalPolicyFile = {
    version: 1,
    rules: [{ risk: 'bulk_content', gate: 'change', mode: 'single' }],
  }
  const check = (g: ApprovalGrant, over: Partial<Parameters<typeof evaluateApproval>[0]> = {}, plan = makePlan()) => {
    const decision = evaluate(plan, { policy, grants: [g], ...over })
    expect(decision.allowed).toBe(false)
    expect(decision.rejected_grants).toHaveLength(1)
    return decision.rejected_grants[0]!.reason
  }

  it('rejects a decision given for a different plan', () => {
    expect(check(grant({ approver: owner, plan_hash: 'hash_b' }))).toBe('plan_hash_mismatch')
  })

  it('rejects an expired decision', () => {
    expect(check(grant({ approver: owner, expires_at: '2026-09-11T11:59:00Z' }))).toBe('expired')
  })

  it('keeps a decision that expires later', () => {
    const decision = evaluate(makePlan(), {
      policy,
      grants: [grant({ approver: owner, expires_at: '2026-09-11T12:00:01Z' })],
    })
    expect(decision.allowed).toBe(true)
  })

  it('never lets an agent approve', () => {
    expect(check(grant({ approver: { kind: 'agent', id: 'other-agent', role: 'owner' } }))).toBe('agent_approver')
  })

  it('refuses self-approval by the plan author', () => {
    const plan = makePlan({ created_by: owner })
    expect(check(grant({ approver: owner }), {}, plan)).toBe('self_approval')
  })

  it('allows self-approval when the project has opted in', () => {
    const plan = makePlan({ created_by: owner })
    const opted: ApprovalPolicyFile = { ...policy, allow_self_approval: true }
    expect(evaluate(plan, { policy: opted, grants: [grant({ approver: owner })] }).allowed).toBe(true)
  })

  it('still refuses an agent self-approving even when the project opted in', () => {
    const opted: ApprovalPolicyFile = { ...policy, allow_self_approval: true }
    const decision = evaluate(makePlan(), { policy: opted, grants: [grant({ approver: agent })] })
    expect(decision.rejected_grants[0]!.reason).toBe('agent_approver')
    expect(decision.allowed).toBe(false)
  })

  it('rejects an approver whose role the rule does not accept', () => {
    const roled: ApprovalPolicyFile = {
      version: 1,
      rules: [{ risk: 'bulk_content', gate: 'change', mode: 'single', roles: ['owner', 'admin'] }],
    }
    const decision = evaluate(makePlan(), { policy: roled, grants: [grant({ approver: editor })] })
    expect(decision.rejected_grants[0]!.reason).toBe('role_not_permitted')
    expect(decision.reasons[0]).toContain('from owner or admin')
  })

  it('counts one person once, however many times they approve', () => {
    const quorum: ApprovalPolicyFile = {
      version: 1,
      rules: [{ risk: 'bulk_content', gate: 'change', mode: 'quorum', min_approvals: 2 }],
    }
    const decision = evaluate(makePlan(), {
      policy: quorum,
      grants: [grant({ approver: owner }), grant({ approver: owner, approved_at: '2026-09-11T11:30:00Z' })],
    })
    expect(decision.rejected_grants).toEqual([{ grant: expect.objectContaining({ approved_at: '2026-09-11T11:30:00Z' }), reason: 'duplicate_approver' }])
    expect(decision.outstanding[0]!.remaining).toBe(1)
  })

  it('reports a decision at a gate nothing asked about', () => {
    expect(check(grant({ approver: owner, gate: 'release' }))).toBe('no_matching_requirement')
  })
})

// ─── The change gate is about a diff ───

describe('the change gate binds to a commit', () => {
  const policy: ApprovalPolicyFile = {
    version: 1,
    rules: [{ risk: 'bulk_content', gate: 'change', mode: 'single' }],
  }

  it('a review of an older tip does not approve the one about to merge', () => {
    const decision = evaluate(makePlan(), {
      policy,
      commit_sha: 'newtip',
      grants: [grant({ approver: owner, commit_sha: 'oldtip' })],
    })
    expect(decision.rejected_grants[0]!.reason).toBe('commit_mismatch')
    expect(decision.allowed).toBe(false)
  })

  it('counts the review of the tip presented', () => {
    const decision = evaluate(makePlan(), {
      policy,
      commit_sha: 'newtip',
      grants: [grant({ approver: owner, commit_sha: 'newtip' })],
    })
    expect(decision.allowed).toBe(true)
  })

  it('falls back to plan_hash alone when no tip is presented', () => {
    const decision = evaluate(makePlan(), { policy, grants: [grant({ approver: owner, commit_sha: 'anything' })] })
    expect(decision.allowed).toBe(true)
  })

  it('does not apply the commit check to other gates', () => {
    const release: ApprovalPolicyFile = {
      version: 1,
      rules: [{ risk: 'bulk_content', gate: 'release', mode: 'single' }],
    }
    const decision = evaluate(makePlan(), {
      policy: release,
      commit_sha: 'newtip',
      grants: [grant({ approver: owner, gate: 'release', commit_sha: 'oldtip' })],
    })
    expect(decision.allowed).toBe(true)
  })
})

// ─── Plan expiry ───

describe('plan expiry', () => {
  const policy: ApprovalPolicyFile = { version: 1, rules: [] }

  it('blocks an expired plan even with every approval in hand', () => {
    const plan = makePlan({ expires_at: '2026-09-11T11:00:00Z' })
    const decision = evaluate(plan, { policy })
    expect(decision.allowed).toBe(false)
    expect(decision.outstanding).toEqual([])
    expect(decision.reasons[0]).toContain('expired')
  })

  it('lets a plan that expires later through', () => {
    const plan = makePlan({ expires_at: '2026-09-11T12:00:01Z' })
    expect(evaluate(plan, { policy }).allowed).toBe(true)
  })
})

// ─── Determinism ───

describe('the evaluator is a pure function of its inputs', () => {
  it('takes `now` rather than reading the clock', () => {
    const plan = makePlan({ expires_at: '2026-09-11T11:59:59Z' })
    const policy: ApprovalPolicyFile = { version: 1, rules: [] }
    expect(evaluateApproval({ plan, policy, now: '2026-09-11T11:00:00Z' }).allowed).toBe(true)
    expect(evaluateApproval({ plan, policy, now: '2026-09-11T12:00:00Z' }).allowed).toBe(false)
  })

  it('does not mutate the policy or the grants it is given', () => {
    const policy: ApprovalPolicyFile = {
      version: 1,
      rules: [{ risk: 'bulk_content', gate: 'change', mode: 'single', roles: ['owner'] }],
    }
    const before = JSON.stringify(policy)
    const grants = [grant({ approver: owner })]
    const grantsBefore = JSON.stringify(grants)

    const decision = evaluate(makePlan(), { policy, grants })
    decision.requirements[0]!.roles!.push('intruder')

    expect(JSON.stringify(policy)).toBe(before)
    expect(JSON.stringify(grants)).toBe(grantsBefore)
  })

  it('returns the same decision for the same inputs', () => {
    const policy: ApprovalPolicyFile = { version: 1, rules: [{ risk: 'bulk_content', gate: 'change', mode: 'quorum', min_approvals: 2 }] }
    const args = { plan: makePlan(), policy, grants: [grant({ approver: owner })], now: NOW }
    expect(evaluateApproval(args)).toEqual(evaluateApproval(args))
  })
})
