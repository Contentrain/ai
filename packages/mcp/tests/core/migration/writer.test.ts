import { describe, expect, it } from 'vitest'
import type { ActorRef, CommitAuthor } from '@contentrain/types'
import { CONTENTRAIN_BRANCH } from '@contentrain/types'
import { MemoryProvider } from '../../../src/testing/memory-provider.js'
import type { MigrationApproval, MigrationScope } from '../../../src/core/migration/index.js'
import { MigrationWriteError, createMigrationWriter, scopeHash } from '../../../src/core/migration/index.js'

const author: CommitAuthor = { name: 'Migration', email: 'ai@contentrain.io' }
const actor: ActorRef = { kind: 'agent', id: 'migrate', name: 'Migration runner' }
const approver: ActorRef = { kind: 'human', id: 'u_1', name: 'Ada', role: 'owner' }

const scope: MigrationScope = {
  allow: ['src/**', 'public/**', 'package.json'],
  branch: 'migration/acme',
  base: 'main',
}

async function approvalFor(over: Partial<MigrationApproval> = {}, target = scope): Promise<MigrationApproval> {
  return {
    scope_hash: await scopeHash(target),
    approver,
    approved_at: '2026-09-11T10:00:00Z',
    ...over,
  }
}

const plan = (paths: string[], over: Record<string, unknown> = {}) => ({
  branch: scope.branch,
  base: scope.base,
  message: 'migrate: emit the site',
  author,
  step: 'emit',
  actor,
  changes: paths.map(path => ({ path, content: `// ${path}\n` })),
  ...over,
})

function setup() {
  const provider = new MemoryProvider({ files: { 'README.md': '# repo\n' } })
  return provider
}

describe('scopeHash', () => {
  it('does not depend on the order the patterns were listed in', async () => {
    const a = await scopeHash({ ...scope, allow: ['src/**', 'public/**', 'package.json'] })
    const b = await scopeHash({ ...scope, allow: ['package.json', 'src/**', 'public/**'] })
    expect(a).toBe(b)
  })

  it('ignores a repeated pattern — the user approved a set of permissions', async () => {
    expect(await scopeHash({ ...scope, allow: [...scope.allow, 'src/**'] })).toBe(await scopeHash(scope))
  })

  it('changes when the permissions do', async () => {
    const base = await scopeHash(scope)
    expect(await scopeHash({ ...scope, allow: [...scope.allow, '.github/**'] })).not.toBe(base)
    expect(await scopeHash({ ...scope, branch: 'migration/other' })).not.toBe(base)
    expect(await scopeHash({ ...scope, base: 'develop' })).not.toBe(base)
  })

  it('is a lowercase 64-character hex SHA-256', async () => {
    expect(await scopeHash(scope)).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('an approved write', () => {
  it('reaches the provider and lands on the migration branch', async () => {
    const provider = setup()
    const writer = createMigrationWriter(provider, scope, await approvalFor())

    const commit = await writer.applyPlan(plan(['src/pages/index.astro', 'package.json']))

    expect(commit.sha).toBeTruthy()
    expect(provider.commits).toHaveLength(1)
    expect(provider.commits[0]!.branch).toBe('migration/acme')
    expect(provider.commits[0]!.changes.map(c => c.path)).toEqual(['src/pages/index.astro', 'package.json'])
  })

  it('records which file, in which step, by which actor, in which commit', async () => {
    const provider = setup()
    const writer = createMigrationWriter(provider, scope, await approvalFor())

    await writer.applyPlan(plan(['src/a.ts']))
    await writer.applyPlan(plan(['public/logo.svg'], { step: 'assets' }))
    await writer.applyPlan(plan([], { step: 'cleanup', changes: [{ path: 'src/a.ts', content: null }] }))

    expect(writer.audit).toHaveLength(3)
    expect(writer.audit[0]).toMatchObject({ step: 'emit', path: 'src/a.ts', action: 'write', pattern: 'src/**', branch: 'migration/acme' })
    expect(writer.audit[1]).toMatchObject({ step: 'assets', path: 'public/logo.svg', pattern: 'public/**' })
    expect(writer.audit[2]).toMatchObject({ step: 'cleanup', path: 'src/a.ts', action: 'delete' })
    expect(writer.audit.every(entry => entry.actor.id === 'migrate')).toBe(true)
    expect(new Set(writer.audit.map(entry => entry.commit)).size).toBe(3)
  })

  it('appends to a caller-supplied trail, so one run has one audit across writers', async () => {
    const trail: Parameters<typeof createMigrationWriter>[3] = []
    const provider = setup()
    const first = createMigrationWriter(provider, scope, await approvalFor(), trail)
    const second = createMigrationWriter(provider, scope, await approvalFor(), trail)

    await first.applyPlan(plan(['src/a.ts']))
    await second.applyPlan(plan(['src/b.ts']))

    expect(trail.map(entry => entry.path)).toEqual(['src/a.ts', 'src/b.ts'])
  })
})

describe('a write outside the scope', () => {
  it('is refused, and nothing at all is written', async () => {
    const provider = setup()
    const writer = createMigrationWriter(provider, scope, await approvalFor())

    // The allowed file in the same plan must not land either: a migration that
    // wrote half its files is worse to recover from than one that wrote none.
    await expect(writer.applyPlan(plan(['src/a.ts', '.github/workflows/deploy.yml'])))
      .rejects.toThrow(MigrationWriteError)

    expect(provider.commits).toHaveLength(0)
    expect(writer.audit).toEqual([])
  })

  it('names the paths that caused the refusal', async () => {
    const provider = setup()
    const writer = createMigrationWriter(provider, scope, await approvalFor())
    const error = await writer.applyPlan(plan(['.env', 'secrets.json'])).catch((e: unknown) => e as MigrationWriteError)

    expect(error).toBeInstanceOf(MigrationWriteError)
    expect(error.code).toBe('path_not_allowed')
    expect(error.paths).toEqual(['.env', 'secrets.json'])
  })

  it('refuses a traversal even when a pattern would otherwise cover it', async () => {
    const provider = setup()
    const writer = createMigrationWriter(provider, scope, await approvalFor())
    await expect(writer.applyPlan(plan(['src/../../../etc/passwd']))).rejects.toThrow(/outside the approved scope/)
    expect(provider.commits).toHaveLength(0)
  })
})

describe('the content branch', () => {
  it('is never a target', async () => {
    const provider = setup()
    const contentScope = { ...scope, branch: CONTENTRAIN_BRANCH }
    const writer = createMigrationWriter(provider, contentScope, await approvalFor({}, contentScope))
    const error = await writer.applyPlan(plan(['src/a.ts'], { branch: CONTENTRAIN_BRANCH }))
      .catch((e: unknown) => e as MigrationWriteError)

    // The branch guard fires first: `contentrain` is not a `migration/*` ref.
    expect(error).toBeInstanceOf(MigrationWriteError)
    expect(error.code).toBe('branch_not_migration')
    expect(provider.commits).toHaveLength(0)
  })

  it('is never a base', async () => {
    const provider = setup()
    const forked = { ...scope, base: CONTENTRAIN_BRANCH }
    const writer = createMigrationWriter(provider, forked, await approvalFor({}, forked))
    const error = await writer.applyPlan(plan(['src/a.ts'], { base: CONTENTRAIN_BRANCH }))
      .catch((e: unknown) => e as MigrationWriteError)

    expect(error.code).toBe('content_branch_target')
    expect(provider.commits).toHaveLength(0)
  })

  /**
   * `ApplyPlanInput.base` defaults to the content branch — an invariant written
   * for content writes, and exactly what a migration must not inherit.
   */
  it('is not inherited as a default base when the plan omits one', async () => {
    const provider = setup()
    const writer = createMigrationWriter(provider, scope, await approvalFor())
    await writer.applyPlan(plan(['src/a.ts'], { base: undefined }))
    expect(provider.commits[0]!.branch).toBe('migration/acme')
    expect(provider.tree(CONTENTRAIN_BRANCH).has('src/a.ts')).toBe(false)
  })
})

describe('a branch the approval does not cover', () => {
  it('is refused even when every path is inside the allowlist', async () => {
    const provider = setup()
    const writer = createMigrationWriter(provider, scope, await approvalFor())
    const error = await writer.applyPlan(plan(['src/a.ts'], { branch: 'migration/other' }))
      .catch((e: unknown) => e as MigrationWriteError)

    expect(error.code).toBe('branch_not_migration')
    expect(error.message).toContain('migration/other')
    expect(provider.commits).toHaveLength(0)
  })

  it('is refused when the scope itself is not a migration/* ref', async () => {
    const provider = setup()
    const bad = { ...scope, branch: 'main' }
    const writer = createMigrationWriter(provider, bad, await approvalFor({}, bad))
    await expect(writer.applyPlan(plan(['src/a.ts'], { branch: 'main' }))).rejects.toThrow(/is not one/)
  })
})

describe('consent', () => {
  it('is refused when it was given for a different scope', async () => {
    const provider = setup()
    // Approved for the narrow scope; the writer then asks for more.
    const narrow = { ...scope, allow: ['src/**'] }
    const writer = createMigrationWriter(provider, scope, await approvalFor({}, narrow))
    const error = await writer.applyPlan(plan(['src/a.ts'])).catch((e: unknown) => e as MigrationWriteError)

    expect(error.code).toBe('scope_not_approved')
    expect(error.message).toContain('collect consent again')
    expect(provider.commits).toHaveLength(0)
  })

  it('is refused once it has expired', async () => {
    const provider = setup()
    const writer = createMigrationWriter(provider, scope, await approvalFor({ expires_at: '2000-01-01T00:00:00Z' }))
    const error = await writer.applyPlan(plan(['src/a.ts'])).catch((e: unknown) => e as MigrationWriteError)

    expect(error.code).toBe('approval_expired')
    expect(provider.commits).toHaveLength(0)
  })

  it('covers the whole run once given, not one write each', async () => {
    const provider = setup()
    const writer = createMigrationWriter(provider, scope, await approvalFor())
    await writer.applyPlan(plan(['src/a.ts']))
    await writer.applyPlan(plan(['src/b.ts']))
    expect(provider.commits).toHaveLength(2)
  })
})
