import type { ContentrainConfig } from '@contentrain/types'

export const NO_PUSH_ENV = 'CONTENTRAIN_NO_PUSH'

/** What a result says when a write stayed local because pushing is off. */
export const LOCAL_MODE_NOTE = 'not pushed (local mode)'

export interface PushPolicy {
  /** Whether any push (branch push or remote branch delete) may happen. */
  push: boolean
  /** Where the decision came from. */
  source: 'env' | 'config' | 'default'
}

/**
 * Whether the local write path may touch the remote. The env wins over the
 * config in both directions: `CONTENTRAIN_NO_PUSH=1` (or `true`) turns
 * pushing off for one run even where config allows it, and `=0` (or
 * `false`) turns it back on over `git.push: false`. Any other value is
 * ignored. Without either, pushing is on (the behaviour before this option).
 * Fetching is not a push and is never gated.
 */
export function pushPolicy(config: Pick<ContentrainConfig, 'git'> | null | undefined, env: NodeJS.ProcessEnv = process.env): PushPolicy {
  const raw = env[NO_PUSH_ENV]?.trim().toLowerCase()
  if (raw === '1' || raw === 'true') return { push: false, source: 'env' }
  if (raw === '0' || raw === 'false') return { push: true, source: 'env' }
  if (config?.git?.push === false) return { push: false, source: 'config' }
  return { push: true, source: 'default' }
}

/** Why nothing was pushed, for an error or a note. */
export function localModeReason(policy: PushPolicy): string {
  return policy.source === 'env'
    ? `pushing is off (${NO_PUSH_ENV}=1)`
    : 'pushing is off (git.push: false in .contentrain/config.json)'
}
