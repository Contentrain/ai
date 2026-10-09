import type { ContentrainConfig } from '@contentrain/types'

export const VERIFY_ENV = 'CONTENTRAIN_VERIFY'

export interface HookPolicy {
  /** Whether Contentrain's own commits run the repository's commit hooks. */
  verify: boolean
  /** Where the decision came from. */
  source: 'env' | 'config' | 'default'
}

/**
 * Whether a machine commit runs the repository's commit hooks (pre-commit,
 * prepare-commit-msg, commit-msg). The same precedence as `pushPolicy`: the
 * env wins over the config in both directions — `CONTENTRAIN_VERIFY=1` (or
 * `true`) runs the hooks for one run even where config does not, and `=0`
 * (or `false`) skips them over `git.verify: true`. Any other value is
 * ignored. Without either, hooks are skipped (the behaviour before this
 * option): turning them on for everyone would fail every write in a repo
 * whose commitlint rejects `[contentrain] …` or whose hook needs the repo's
 * `node_modules`, which the temporary worktree does not have.
 *
 * Only commits are gated. `git merge` runs the merge hooks and `git push`
 * the pre-push hook either way, as they always have.
 */
export function hookPolicy(config: Pick<ContentrainConfig, 'git'> | null | undefined, env: NodeJS.ProcessEnv = process.env): HookPolicy {
  const raw = env[VERIFY_ENV]?.trim().toLowerCase()
  if (raw === '1' || raw === 'true') return { verify: true, source: 'env' }
  if (raw === '0' || raw === 'false') return { verify: false, source: 'env' }
  if (config?.git?.verify === true) return { verify: true, source: 'config' }
  return { verify: false, source: 'default' }
}

/**
 * The options for a machine `git commit`: `extra` plus `--no-verify` unless
 * the policy runs the hooks. With hooks on, a rejecting hook makes the commit
 * throw with the hook's output, and the caller fails the write — there is no
 * retry without hooks.
 */
export function commitOptions(policy: HookPolicy, extra: Record<string, null> = {}): Record<string, null> {
  return policy.verify ? { ...extra } : { ...extra, '--no-verify': null }
}
