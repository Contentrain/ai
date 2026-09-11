// ─── The allowlisted migration write path ───
//
// A migration does not deliver content, it delivers a codebase: `src/`,
// `public/`, `package.json`, a lockfile, deploy configuration. None of that is
// what the content engine's write path was built for, and widening that path
// would quietly move a security boundary the whole product rests on.
//
// So this is a wrapper, not a provider. `GitHubProvider.applyPlan` can already
// write any path; what was missing was a gate in front of it. The gate carries
// every requirement the repository-boundary contract asks for:
//
//   scope     a file allowlist; nothing outside it is written
//   consent   one explicit approval, bound to the exact scope it was shown
//   branch    a `migration/*` ref; the content branch is never a target or base
//   trail     which file, in which step, by which actor, in which commit
//   undo      one branch, delivered as one PR, revertable in one `git revert`
//
// Every refusal happens before the provider is called. A rejected plan writes
// nothing at all — not the allowed part of it — because a half-applied
// migration is harder to reason about than one that did not start.

import type {
  ActorRef,
  ApplyPlanInput,
  Commit,
  FileChange,
  RepoProvider,
  RepoWriter,
} from '@contentrain/types'
import { CONTENTRAIN_BRANCH, canonicalStringify } from '@contentrain/types'
import { decide } from './allowlist.js'

/** Branch names a migration may write to. */
export const MIGRATION_BRANCH_PREFIX = 'migration/'

export interface MigrationScope {
  /**
   * Path patterns this migration may write. `*` matches within a segment,
   * `**` spans segments. Nothing is implicit — not even `.contentrain/**`.
   */
  allow: string[]
  /** The branch every write lands on. Must start with `migration/`. */
  branch: string
  /** Optional base to fork from. Must not be the content branch. */
  base?: string
}

/**
 * A user's consent, bound to the exact scope they were shown.
 *
 * `scope_hash` is what makes the consent meaningful: an approval of "may write
 * `src/**` on `migration/acme`" cannot be replayed against a scope that also
 * includes `.github/workflows/**`. Compute it with {@link scopeHash} and show
 * the user the scope, not the hash.
 */
export interface MigrationApproval {
  scope_hash: string
  approver: ActorRef
  /** ISO 8601 UTC. */
  approved_at: string
  /** ISO 8601 UTC; consent past this instant is not consent. */
  expires_at?: string
}

/** One write, as it happened. The audit trail is a list of these. */
export interface MigrationAuditEntry {
  /** The step of the migration that produced the write. */
  step: string
  path: string
  action: 'write' | 'delete'
  /** The allowlist pattern that permitted it. */
  pattern: string
  actor: ActorRef
  /** ISO 8601 UTC. */
  at: string
  /** The commit the write landed in. */
  commit: string
  branch: string
}

export interface MigrationWriteInput extends ApplyPlanInput {
  /** Names the migration step, for the audit trail. */
  step: string
  /** Who is writing. Recorded on every entry. */
  actor: ActorRef
}

/**
 * The wrapped writer. `applyPlan` asks for `step` and `actor` because an audit
 * trail without them answers "what changed" but not "who did this, and when" —
 * which is the question a trail exists for. It still satisfies `RepoWriter`, so
 * anything that takes a provider's writer takes this.
 */
export interface MigrationWriter extends RepoWriter {
  applyPlan: (input: MigrationWriteInput) => Promise<Commit>
  readonly audit: readonly MigrationAuditEntry[]
}

export class MigrationWriteError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'scope_not_approved'
      | 'approval_expired'
      | 'branch_not_migration'
      | 'content_branch_target'
      | 'path_not_allowed',
    /** The paths that caused a `path_not_allowed` refusal. */
    readonly paths?: string[],
  ) {
    super(message)
    this.name = 'MigrationWriteError'
  }
}

/**
 * The identity of a scope: the sorted allowlist, the branch and the base.
 *
 * Sorted so that two callers listing the same patterns in a different order get
 * one hash — the user approved a set of permissions, not an ordering. SHA-256
 * over canonical JSON, matching `computePlanHash` in `@contentrain/types`, so a
 * consumer can recompute it from the published contract.
 */
export async function scopeHash(scope: MigrationScope): Promise<string> {
  const payload = canonicalStringify({
    allow: [...new Set(scope.allow)].toSorted(),
    branch: scope.branch,
    base: scope.base,
  })
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function isContentBranch(name: string | undefined): boolean {
  return name === CONTENTRAIN_BRANCH
}

/**
 * Wrap a provider so it will only write a migration's approved scope.
 *
 * The returned writer refuses — before touching the provider — a branch that is
 * not the approved one, any target or base that is the content branch, an
 * approval that does not match the scope or has expired, and any change whose
 * path no pattern covers.
 */
export function createMigrationWriter(
  provider: RepoProvider,
  scope: MigrationScope,
  approval: MigrationApproval,
  audit: MigrationAuditEntry[] = [],
): MigrationWriter {
  let verified: string | undefined

  const assertScope = async (now: string): Promise<void> => {
    verified ??= await scopeHash(scope)
    if (approval.scope_hash !== verified) {
      throw new MigrationWriteError(
        'The approval was given for a different scope. Show the user the current allowlist and branch, and collect consent again.',
        'scope_not_approved',
      )
    }
    if (approval.expires_at && approval.expires_at <= now) {
      throw new MigrationWriteError(`The approval expired at ${approval.expires_at}.`, 'approval_expired')
    }
    if (!scope.branch.startsWith(MIGRATION_BRANCH_PREFIX)) {
      throw new MigrationWriteError(
        `A migration writes to "${MIGRATION_BRANCH_PREFIX}*"; "${scope.branch}" is not one.`,
        'branch_not_migration',
      )
    }
    if (isContentBranch(scope.branch) || isContentBranch(scope.base)) {
      throw new MigrationWriteError(
        `A migration never targets or forks the "${CONTENTRAIN_BRANCH}" branch — that ref is the content state's single source of truth.`,
        'content_branch_target',
      )
    }
  }

  return {
    get audit() {
      return audit
    },

    async applyPlan(input: MigrationWriteInput): Promise<Commit> {
      const now = new Date().toISOString()
      await assertScope(now)

      if (input.branch !== scope.branch) {
        throw new MigrationWriteError(
          `The approval covers "${scope.branch}"; this write targets "${input.branch}".`,
          'branch_not_migration',
        )
      }
      if (isContentBranch(input.branch) || isContentBranch(input.base)) {
        throw new MigrationWriteError(
          `A migration never targets or forks the "${CONTENTRAIN_BRANCH}" branch.`,
          'content_branch_target',
        )
      }

      // Decide every path before writing any of them. A plan that is partly
      // outside the scope is refused whole: a migration that wrote half its
      // files is worse to recover from than one that wrote none.
      const decisions = input.changes.map((change: FileChange) => ({ change, decision: decide(change.path, scope.allow) }))
      const refused = decisions.filter(entry => !entry.decision.allowed)
      if (refused.length) {
        const paths = refused.map(entry => entry.change.path)
        throw new MigrationWriteError(
          `${paths.length} path${paths.length === 1 ? '' : 's'} outside the approved scope: ${paths.slice(0, 5).join(', ')}${paths.length > 5 ? ', …' : ''}`,
          'path_not_allowed',
          paths,
        )
      }

      // `base` defaults to the content branch on `ApplyPlanInput`, which is
      // exactly what a migration must not fork. Make the intent explicit rather
      // than inheriting an invariant written for content.
      const commit = await provider.applyPlan({ ...input, base: input.base ?? scope.base })

      for (const { change, decision } of decisions) {
        audit.push({
          step: input.step ?? 'unnamed',
          path: change.path,
          action: change.content === null ? 'delete' : 'write',
          pattern: decision.pattern!,
          actor: input.actor ?? { kind: 'system', id: 'migration' },
          at: now,
          commit: commit.sha,
          branch: input.branch,
        })
      }

      return commit
    },
  }
}
