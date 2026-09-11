import { describe, it, expect, expectTypeOf } from 'vitest'
import type {
  ActorRef,
  ApprovalGrant,
  ApprovalPolicyFile,
  ApprovalRequirement,
  AutomationDefinition,
  DeploymentTarget,
  ExecutionPlan,
  ExecutionReceipt,
  RiskClass,
  RunStatus,
  SourceDeltaPlan,
} from './index'
import {
  APPROVAL_GATES,
  APPROVAL_MODES,
  EXECUTION_CONTRACT_VERSION,
  RISK_CLASSES,
  RUN_STATUSES,
  SCHEDULE_KINDS,
  SOURCE_DELTA_OPS,
  TERMINAL_RUN_STATUSES,
  approversFor,
  computePlanHash,
  highestRisk,
  isTerminalRunStatus,
  planHashPayload,
  riskRank,
} from './index'

// ─── Fixtures: realistic documents, typed against the contracts ───

const author: ActorRef = { kind: 'agent', id: 'claude', name: 'Claude' }
const reviewer: ActorRef = { kind: 'human', id: 'u_1', name: 'Ada', role: 'owner' }
const releaser: ActorRef = { kind: 'human', id: 'u_2', name: 'Grace', role: 'admin' }

const plan: ExecutionPlan = {
  version: EXECUTION_CONTRACT_VERSION,
  id: 'run_01',
  plan_hash: '',
  intent: 'Publish the twelve reviewed posts and deploy',
  risk: 'deployment',
  steps: [
    {
      id: 's1',
      tool: 'contentrain_bulk',
      summary: 'Move 12 blog-post entries from in_review to published',
      risk: 'bulk_content',
      scope: { models: ['blog-post'], locales: ['en'], entries: Array.from({ length: 12 }, (_, i) => `e${i}`) },
      input: { operation: 'update_status', status: 'published' },
    },
    {
      id: 's2',
      tool: 'deploy',
      summary: 'Trigger the production build',
      risk: 'deployment',
      scope: { providers: ['netlify'], external_domains: ['api.netlify.com'] },
    },
  ],
  scope: {
    models: ['blog-post'],
    locales: ['en'],
    entries: Array.from({ length: 12 }, (_, i) => `e${i}`),
    providers: ['netlify'],
    external_domains: ['api.netlify.com'],
  },
  estimate: { items: 12, duration_ms: 90_000, currency: 'USD', cost: 0.4, bytes_stored: 4_194_304, bytes_out: 1_048_576 },
  rollback: { available: true, command: 'contentrain_bulk --operation update_status --status in_review', revert_to: 'abc1234' },
  project: { branch: 'main', commit_sha: 'abc1234', content_commit_sha: 'def5678' },
  created_at: '2026-09-11T09:00:00Z',
  created_by: author,
}

const policy: ApprovalPolicyFile = {
  version: 1,
  default_mode: 'single',
  rules: [
    { risk: 'read_only', gate: 'plan', mode: 'auto' },
    { risk: 'bulk_content', gate: 'change', mode: 'single', roles: ['owner', 'admin'] },
    { risk: 'deployment', gate: 'release', mode: 'quorum', min_approvals: 2 },
  ],
}

const receipt: ExecutionReceipt = {
  version: EXECUTION_CONTRACT_VERSION,
  id: 'rcpt_01',
  plan_id: 'run_01',
  plan_hash: 'deadbeef',
  status: 'completed',
  actor: author,
  approvals: [
    { gate: 'change', plan_hash: 'deadbeef', commit_sha: 'def5678', approver: reviewer, approved_at: '2026-09-11T09:05:00Z' },
    { gate: 'release', plan_hash: 'deadbeef', approver: reviewer, approved_at: '2026-09-11T09:06:00Z' },
    { gate: 'release', plan_hash: 'deadbeef', approver: releaser, approved_at: '2026-09-11T09:07:00Z' },
  ],
  started_at: '2026-09-11T09:10:00Z',
  finished_at: '2026-09-11T09:11:30Z',
  applied: { models: ['blog-post'], locales: ['en'], entries: Array.from({ length: 12 }, (_, i) => `e${i}`) },
  checkpoints: [
    { step_id: 's1', status: 'completed', at: '2026-09-11T09:10:40Z', commit_sha: 'aaa1111' },
    { step_id: 's2', status: 'completed', at: '2026-09-11T09:11:30Z' },
  ],
  verification: [
    { id: 'build', name: 'astro build', passed: true },
    { id: 'links', name: 'internal links resolve', passed: true, value: 0, expected: 0 },
  ],
  cost: { items: 12, duration_ms: 90_000, currency: 'USD', cost: 0.37, bytes_stored: 4_050_000, bytes_out: 990_000 },
  project: { branch: 'main', commit_sha: 'aaa1111' },
}

const delta: SourceDeltaPlan = {
  version: EXECUTION_CONTRACT_VERSION,
  generated_at: '2026-09-11T10:00:00Z',
  cursor: { kind: 'bridge_inventory', inventory_hash: 'h0', taken_at: '2026-09-01T00:00:00Z' },
  next_cursor: { kind: 'bridge_inventory', inventory_hash: 'h1', taken_at: '2026-09-11T10:00:00Z' },
  deletions_detectable: true,
  entries: [
    { op: 'created', wp_id: 900, wp_type: 'post', model: 'blog-post', locale: 'en' },
    { op: 'updated', wp_id: 12, model: 'blog-post', entry_id: 'e3', fingerprint_before: 'a', fingerprint_after: 'b' },
    { op: 'deleted', wp_id: 44, model: 'blog-post', entry_id: 'e7', detail: 'absent from the inventory' },
    { op: 'moved', wp_id: 18, model: 'blog-post', entry_id: 'e9', slug_before: 'old-name', slug_after: 'new-name' },
    { op: 'updated', wp_id: 21, model: 'blog-post', entry_id: 'e11', conflict: true, detail: 'edited in both places' },
  ],
  redirects: [{ from: '/old-name', to: '/new-name', status: 301 }],
  warnings: ['media binaries are not carried by this plan'],
}

// ─── Risk ───

describe('risk classes', () => {
  it('is a ladder in ascending severity', () => {
    expect(RISK_CLASSES).toEqual([
      'read_only',
      'low_risk_content',
      'bulk_content',
      'destructive_schema',
      'external_effect',
      'financially_material',
      'deployment',
    ])
    expect(riskRank('read_only')).toBe(0)
    expect(riskRank('deployment')).toBe(RISK_CLASSES.length - 1)
    expect(riskRank('bulk_content')).toBeGreaterThan(riskRank('low_risk_content'))
  })

  it('rates a plan by its worst step, not its first', () => {
    expect(highestRisk(['read_only', 'deployment', 'low_risk_content'])).toBe('deployment')
    expect(highestRisk(['read_only'])).toBe('read_only')
  })

  it('treats an empty step list as read-only', () => {
    expect(highestRisk([])).toBe('read_only')
  })

  it('matches the plan fixture: a survey that ends in a deploy is a deploy', () => {
    expect(highestRisk(plan.steps.map(step => step.risk))).toBe(plan.risk)
  })
})

// ─── Approval ───

describe('approval vocabulary', () => {
  it('keeps the three decision moments distinct', () => {
    expect(APPROVAL_GATES).toEqual(['plan', 'change', 'release'])
    expect(APPROVAL_MODES).toEqual(['auto', 'single', 'quorum'])
  })

  it('types a policy file against the rule shape', () => {
    expectTypeOf(policy.rules[0]!.risk).toEqualTypeOf<RiskClass>()
    expect(policy.rules.map(rule => rule.gate)).toEqual(['plan', 'change', 'release'])
  })

  it('reads release approvers off a receipt without a duplicate field', () => {
    expect(approversFor(receipt, 'release').map(actor => actor.id)).toEqual(['u_1', 'u_2'])
    expect(approversFor(receipt, 'change').map(actor => actor.id)).toEqual(['u_1'])
    expect(approversFor(receipt, 'plan')).toEqual([])
  })

  it('returns no approvers when a receipt records none', () => {
    expect(approversFor({ ...receipt, approvals: undefined }, 'release')).toEqual([])
  })

  it('binds a grant to one plan hash', () => {
    const grant: ApprovalGrant = receipt.approvals![0]!
    expect(grant.plan_hash).toBe(receipt.plan_hash)
    expectTypeOf(grant.approver).toEqualTypeOf<ActorRef>()
  })

  it('states the requirement shape a UI renders', () => {
    const requirement: ApprovalRequirement = { gate: 'release', mode: 'quorum', min_approvals: 2, because: 'deployment' }
    expect(requirement.because).toBe('deployment')
  })
})

// ─── Run status ───

describe('run status', () => {
  it('carries the full lifecycle plus the interrupted states', () => {
    expect(RUN_STATUSES).toContain('awaiting_approval')
    expect(RUN_STATUSES).toContain('verifying')
    expect(RUN_STATUSES).toContain('needs_attention')
    expect(new Set(RUN_STATUSES).size).toBe(RUN_STATUSES.length)
  })

  it('knows which statuses will not move on their own', () => {
    expect(isTerminalRunStatus('completed')).toBe(true)
    expect(isTerminalRunStatus('rolled_back')).toBe(true)
    expect(isTerminalRunStatus('retrying')).toBe(false)
    expect(isTerminalRunStatus('awaiting_approval')).toBe(false)
  })

  it('keeps every terminal status inside the status list', () => {
    for (const status of TERMINAL_RUN_STATUSES) {
      expect(RUN_STATUSES).toContain(status)
    }
    expectTypeOf(TERMINAL_RUN_STATUSES[0]).toMatchTypeOf<RunStatus>()
  })
})

// ─── Plan hash ───

describe('plan hash', () => {
  it('is stable across identical plans built at different times by different actors', async () => {
    const rebuilt: ExecutionPlan = {
      ...plan,
      id: 'run_99',
      created_at: '2026-10-01T00:00:00Z',
      created_by: reviewer,
      idempotency_key: 'retry-3',
    }
    expect(await computePlanHash(rebuilt)).toBe(await computePlanHash(plan))
  })

  it('ignores its own plan_hash field', async () => {
    expect(await computePlanHash({ ...plan, plan_hash: 'whatever' })).toBe(await computePlanHash(plan))
  })

  it('is a lowercase 64-character hex SHA-256', async () => {
    expect(await computePlanHash(plan)).toMatch(/^[0-9a-f]{64}$/)
  })

  // Cross-checked against an independent implementation: canonical JSON
  // (sorted keys, 2-space indent, trailing newline) hashed with SHA-256 in
  // Python produces this same digest. That is the contract — any consumer,
  // in any language, must be able to recompute a plan's hash and get this.
  it('pins the payload composition — a golden hash for the fixture plan', async () => {
    expect(await computePlanHash(plan)).toBe('a45b5e5db97c502436aa2eb6195da6cf11590bbfe5d93092efd5a10178dbc0b1')
  })

  it.each([
    ['a widened scope', { ...plan, scope: { ...plan.scope, entries: [...plan.scope.entries!, 'e12'] } }],
    ['an added step', { ...plan, steps: [...plan.steps, { id: 's3', tool: 'purge', summary: 'Purge the CDN', risk: 'deployment' as const }] }],
    ['a raised estimate', { ...plan, estimate: { ...plan.estimate, cost: 40 } }],
    ['a withdrawn rollback', { ...plan, rollback: { available: false, reason: 'the provider has no undo' } }],
    ['a changed intent', { ...plan, intent: 'Publish everything' }],
    ['a different commit', { ...plan, project: { ...plan.project, commit_sha: 'ffff999' } }],
    ['a changed tool input', { ...plan, steps: [{ ...plan.steps[0]!, input: { operation: 'delete' } }, plan.steps[1]!] }],
  ])('changes when the plan does: %s', async (_label, changed) => {
    expect(await computePlanHash(changed)).not.toBe(await computePlanHash(plan))
  })

  it('covers the metered cost fields, so a changed bill invalidates approval', async () => {
    // Cost is metered before it is priced: tokens, time, bytes stored, bytes
    // moved. A plan approved at one of those figures must not run at another.
    for (const field of ['tokens', 'bytes_stored', 'bytes_out', 'duration_ms', 'items'] as const) {
      const changed = { ...plan, estimate: { ...plan.estimate, [field]: 999_999_999 } }
      expect(await computePlanHash(changed), field).not.toBe(await computePlanHash(plan))
    }
  })

  it('does not depend on key order', async () => {
    const reordered = Object.fromEntries(Object.entries(plan).toReversed()) as unknown as ExecutionPlan
    expect(Object.keys(reordered)).not.toEqual(Object.keys(plan))
    expect(await computePlanHash(reordered)).toBe(await computePlanHash(plan))
  })

  it('exposes the exact payload so a disagreement can be investigated', () => {
    const payload = planHashPayload(plan)
    const covered = Object.keys(JSON.parse(payload) as Record<string, unknown>)
    expect(covered).not.toContain('id')
    expect(covered).not.toContain('plan_hash')
    expect(covered).not.toContain('created_at')
    expect(covered).not.toContain('created_by')
    expect(covered).not.toContain('idempotency_key')
    expect(covered).toEqual(['estimate', 'intent', 'project', 'risk', 'rollback', 'scope', 'steps', 'version'])
    // A step's own `id` is part of what will happen, so it stays covered.
    expect(JSON.parse(payload)).toMatchObject({ intent: plan.intent, risk: 'deployment', steps: [{ id: 's1' }, { id: 's2' }] })
  })
})

// ─── Deployment, automation, source delta ───

describe('deployment target', () => {
  it('carries a secret reference, never a secret', () => {
    const target: DeploymentTarget = { id: 'prod', provider: 'netlify', site_id: 'abc', secret_ref: 'NETLIFY_TOKEN', branch: 'main' }
    expect(Object.keys(target)).not.toContain('token')
    expect(target.secret_ref).toBe('NETLIFY_TOKEN')
    expectTypeOf<DeploymentTarget>().not.toHaveProperty('secret')
  })
})

describe('automation definition', () => {
  it('reserves the schedule vocabulary', () => {
    expect(SCHEDULE_KINDS).toContain('recurring')
    expect(SCHEDULE_KINDS).toContain('content_event')
    expect(SCHEDULE_KINDS).toContain('manual')
  })

  it('types a recurring definition with a timezone and a misfire policy', () => {
    const automation: AutomationDefinition = {
      version: EXECUTION_CONTRACT_VERSION,
      id: 'weekly-seo',
      name: 'Weekly SEO audit',
      enabled: true,
      schedule: { kind: 'recurring', cron: '0 9 * * 1', timezone: 'Europe/Istanbul', misfire: 'run_once' },
      intent: 'Audit the site for SEO regressions and open a report',
      risk: 'read_only',
      max_retries: 2,
    }
    expect(automation.schedule.timezone).toBe('Europe/Istanbul')
    expect(automation.risk).toBe('read_only')
  })
})

describe('source delta plan', () => {
  it('names all four operations, deletion included', () => {
    expect(SOURCE_DELTA_OPS).toEqual(['created', 'updated', 'deleted', 'moved'])
  })

  it('carries tombstones, moves and semantic conflicts side by side', () => {
    expect(delta.entries.filter(entry => entry.op === 'deleted')).toHaveLength(1)
    expect(delta.entries.filter(entry => entry.conflict)).toHaveLength(1)
    const moved = delta.entries.find(entry => entry.op === 'moved')!
    expect([moved.slug_before, moved.slug_after]).toEqual(['old-name', 'new-name'])
    expect(delta.redirects).toEqual([{ from: '/old-name', to: '/new-name', status: 301 }])
  })

  it('states whether deletions could be seen at all', () => {
    expect(delta.deletions_detectable).toBe(true)
    const restDelta: SourceDeltaPlan = {
      ...delta,
      cursor: { kind: 'rest_modified_after', modified_after: '2026-09-01T00:00:00Z', taken_at: '2026-09-01T00:00:00Z' },
      deletions_detectable: false,
      entries: delta.entries.filter(entry => entry.op !== 'deleted'),
    }
    expect(restDelta.deletions_detectable).toBe(false)
    expect(restDelta.entries.some(entry => entry.op === 'deleted')).toBe(false)
  })
})
