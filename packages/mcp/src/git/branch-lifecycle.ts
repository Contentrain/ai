import { simpleGit, type SimpleGit } from 'simple-git'
import { CONTENTRAIN_BRANCH, type ContentrainConfig } from '@contentrain/types'
import { readConfig } from '../core/config.js'
import { NETWORK_UNSAFE } from './identity.js'

export interface CleanupResult {
  deleted: number
  remaining: number
  deletedBranches: string[]
}

export interface BranchHealthCheck {
  total: number
  merged: number
  unmerged: number
  warning: boolean
  blocked: boolean
  message?: string
}

/**
 * Lists all local contentrain/* branches, deletes those already merged
 * into the base branch, and returns the count of remaining unmerged ones.
 */
export async function cleanupMergedBranches(projectRoot: string): Promise<CleanupResult> {
  const git = simpleGit(projectRoot)
  const config = await readConfig(projectRoot)

  // Determine base branch
  const baseBranch = config?.repository?.default_branch
    ?? process.env['CONTENTRAIN_BRANCH']
    ?? ((await git.raw(['branch', '--show-current'])).trim() || 'main')

  // Get all local branches (exclude the dedicated contentrain branch itself)
  const branchSummary = await git.branchLocal()
  const contentrainBranches = branchSummary.all
    .filter(b => b.startsWith('cr/'))
    .filter(b => b !== CONTENTRAIN_BRANCH)

  if (contentrainBranches.length === 0) {
    return { deleted: 0, remaining: 0, deletedBranches: [] }
  }

  // Check merged into the dedicated contentrain branch, falling back to baseBranch
  let mergedSet: Set<string>
  try {
    mergedSet = await classifyMergedBranches(projectRoot, contentrainBranches, CONTENTRAIN_BRANCH)
  } catch {
    // Contentrain branch may not exist yet (pre-init); fall back to baseBranch
    try {
      mergedSet = await classifyMergedBranches(projectRoot, contentrainBranches, baseBranch)
    } catch {
      // Base branch may not exist either; nothing is merged
      return { deleted: 0, remaining: contentrainBranches.length, deletedBranches: [] }
    }
  }

  const mergedContentrain = contentrainBranches.filter(b => mergedSet.has(b))
  const deletedBranches: string[] = []

  // Determine retention period (days). Default: 30
  const retentionDays = config?.branchRetention ?? 30
  const retentionMs = retentionDays * 24 * 60 * 60 * 1000
  const now = Date.now()

  // Delete merged branches only if older than retention period
  for (const branch of mergedContentrain) {
    try {
      const timestampRaw = (await git.raw(['log', '-1', '--format=%ct', branch])).trim()
      const commitTimestamp = Number(timestampRaw) * 1000
      if (now - commitTimestamp < retentionMs) {
        continue // Branch is within retention period — keep it
      }
      // -D, not -d: classifyMergedBranches already proved merged-ness (including
      // patch-id equivalence after a base-history rewrite, which -d's
      // ancestry-only check would refuse).
      await git.raw(['branch', '-D', branch])
      deletedBranches.push(branch)
    } catch {
      // Branch may be checked out, locked, or log failed — skip
    }
  }

  const remaining = contentrainBranches.length - deletedBranches.length
  return { deleted: deletedBranches.length, remaining, deletedBranches }
}

/**
 * Check branch health: count contentrain/* branches and return warning/blocked status.
 * - 50+ branches: warning
 * - 80+ branches: blocked
 */
export async function checkBranchHealth(projectRoot: string): Promise<BranchHealthCheck> {
  const git = simpleGit(projectRoot)
  const config = await readConfig(projectRoot)

  const baseBranch = config?.repository?.default_branch
    ?? process.env['CONTENTRAIN_BRANCH']
    ?? ((await git.raw(['branch', '--show-current'])).trim() || 'main')

  const branchSummary = await git.branchLocal()
  const contentrainBranches = branchSummary.all
    .filter(b => b.startsWith('cr/'))
    .filter(b => b !== CONTENTRAIN_BRANCH)
  const total = contentrainBranches.length

  const warnLimit = config?.branchWarnLimit ?? 50
  const blockLimit = config?.branchBlockLimit ?? 80

  // Count merged into contentrain branch, falling back to baseBranch.
  // This gate runs before EVERY write: the patch-id fallback (which rescues
  // rewrite-orphaned merged branches from being counted as unmerged) only
  // matters once the ancestry-unmerged count could trip the warning, so
  // below `warnLimit` the check costs exactly one `branch --merged`.
  let mergedCount = 0
  const classifyOpts = { fallbackThreshold: warnLimit }
  try {
    const mergedSet = await classifyMergedBranches(projectRoot, contentrainBranches, CONTENTRAIN_BRANCH, classifyOpts)
    mergedCount = mergedSet.size
  } catch {
    // Contentrain branch may not exist yet (pre-init); fall back to baseBranch
    try {
      const mergedSet = await classifyMergedBranches(projectRoot, contentrainBranches, baseBranch, classifyOpts)
      mergedCount = mergedSet.size
    } catch {
      // ignore — neither branch exists
    }
  }
  const unmerged = total - mergedCount
  const warning = unmerged >= warnLimit
  const blocked = unmerged >= blockLimit

  let message: string | undefined
  if (blocked) {
    message = `BLOCKED: ${unmerged} active contentrain branches (limit: ${blockLimit}). Run cleanup or merge/delete old branches before creating new ones.`
  } else if (warning) {
    message = `WARNING: ${unmerged} active contentrain branches. Consider merging or deleting old branches (warning at ${warnLimit}, blocked at ${blockLimit}).`
  }

  return { total, merged: mergedCount, unmerged, warning, blocked, message }
}

export interface BranchDiffResult {
  /** The feature branch the diff was computed from. */
  branch: string
  /** The base ref the diff was computed against. Defaults to the `contentrain` branch. */
  base: string
  /** `git diff --stat` output — human-readable summary. */
  stat: string
  /** Raw unified diff. */
  patch: string
  /** Number of files touched in the diff. */
  filesChanged: number
}

/**
 * Compute the diff between a feature branch and its base.
 *
 * Defaults `base` to `CONTENTRAIN_BRANCH` — the singleton content-
 * tracking branch every feature branch forks from. Passing the repo's
 * default branch (e.g. `main`) is almost always a bug: when
 * `contentrain` is ahead of `main`, the diff picks up unrelated
 * historical content changes that the feature branch did not produce.
 *
 * Used by `contentrain serve` (branch detail view), the `contentrain
 * diff` CLI command, and any Studio-side driver that needs to preview
 * a feature branch before approving it.
 */
export async function branchDiff(
  projectRoot: string,
  opts: { branch: string, base?: string },
): Promise<BranchDiffResult> {
  const git = simpleGit(projectRoot)
  const base = opts.base ?? CONTENTRAIN_BRANCH
  const range = `${base}...${opts.branch}`

  const [stat, patch, summary] = await Promise.all([
    git.diff([range, '--stat']),
    git.diff([range]),
    git.diffSummary([range]),
  ])

  return {
    branch: opts.branch,
    base,
    stat,
    patch,
    filesChanged: summary.changed,
  }
}

// ─── Merged-state classification (ancestry + patch-id fallback) ───

/**
 * Merged-verdict caches.
 *
 * - `pairVerdictCache` — keyed by `(tipSha, intoTipSha, cap)`: the
 *   relationship between two FIXED commits never changes, so entries are
 *   permanently valid.
 * - `mergedTipCache` — keyed by `(tipSha, into NAME)`: once a tip is merged
 *   into a branch, it stays merged as that branch advances (merged-ness is
 *   monotonic), so positives survive `contentrain` moving forward. This is
 *   what keeps the per-write branch-health gate cheap in long-lived
 *   processes (MCP server, `contentrain serve`).
 */
const pairVerdictCache = new Map<string, boolean>()
const mergedTipCache = new Map<string, true>()
const MERGED_CACHE_LIMIT = 10_000
const DEFAULT_MAX_CHERRY_COMMITS = 200
/** Concurrent `git cherry` subprocesses during classification. */
const CHERRY_CONCURRENCY = 8

async function isTipMerged(
  git: SimpleGit,
  tip: string,
  intoTip: string,
  maxCherryCommits: number,
  intoName?: string,
): Promise<boolean> {
  const tipKey = intoName ? `${tip}→${intoName}` : undefined
  if (tipKey && mergedTipCache.has(tipKey)) return true
  const pairKey = `${tip}:${intoTip}:${maxCherryCommits}`
  const cached = pairVerdictCache.get(pairKey)
  if (cached !== undefined) return cached

  let merged = false
  try {
    // ONE subprocess answers both questions: `git cherry intoTip tip` lists
    // tip's commits missing from intoTip by ancestry — empty output means
    // ancestor (merged); otherwise a line without `+` is patch-id-equivalent
    // to a commit already in intoTip (survives base-history rewrites).
    // Deliberately NOT `merge-base --is-ancestor`: that plumbing signals via
    // exit code with EMPTY stderr, and simple-git reports exit-code-only
    // failures as success, silently inverting the check. Bounded by
    // maxCherryCommits so rewrite-orphaned deep histories cannot stall the
    // hot pre-write gate.
    const lines = (await git.raw(['cherry', intoTip, tip]))
      .split('\n').map(line => line.trim()).filter(Boolean)
    if (lines.length === 0) {
      merged = true
    } else if (lines.length <= maxCherryCommits) {
      merged = !lines.some(line => line.startsWith('+'))
    }
  } catch {
    merged = false
  }

  if (pairVerdictCache.size >= MERGED_CACHE_LIMIT) pairVerdictCache.clear()
  pairVerdictCache.set(pairKey, merged)
  if (merged && tipKey) {
    if (mergedTipCache.size >= MERGED_CACHE_LIMIT) mergedTipCache.clear()
    mergedTipCache.set(tipKey, true)
  }
  return merged
}

/**
 * Robust merged check for a single ref: ancestry fast-path, then a bounded
 * `git cherry` (patch-id) fallback that survives base-history rewrites.
 * Returns false when either ref cannot be resolved.
 */
export async function isRefMerged(
  git: SimpleGit,
  ref: string,
  into: string,
  opts?: { maxCherryCommits?: number },
): Promise<boolean> {
  let tip: string | undefined
  let intoTip: string | undefined
  try {
    const lines = (await git.raw(['rev-parse', ref, into])).trim().split('\n')
    tip = lines[0]?.trim()
    intoTip = lines[1]?.trim()
  } catch {
    return false
  }
  if (!tip || !intoTip) return false
  return isTipMerged(git, tip, intoTip, opts?.maxCherryCommits ?? DEFAULT_MAX_CHERRY_COMMITS, into)
}

/**
 * Classify which of the given local branches are merged into `into`
 * (default: the contentrain branch). One `git branch --merged` call covers
 * the ancestry-merged majority; only the remainder pays the patch-id
 * fallback (bounded concurrency, verdicts cached).
 *
 * `opts.fallbackThreshold` skips the patch-id fallback entirely when fewer
 * than that many branches are ancestry-unmerged — the fallback can only
 * LOWER the unmerged count, so callers that merely compare the count
 * against a limit (the hot pre-write gate) pay nothing in the normal case.
 *
 * Throws when `into` does not resolve — callers use this to fall back to
 * the base branch (mirrors the previous `branch --merged` semantics).
 */
export async function classifyMergedBranches(
  projectRoot: string,
  branches: string[],
  into: string = CONTENTRAIN_BRANCH,
  opts?: { fallbackThreshold?: number },
): Promise<Set<string>> {
  const git = simpleGit(projectRoot)
  if (branches.length === 0) {
    // Preserve the "throws when into is missing" contract even for empty input.
    await git.raw(['branch', '--merged', into])
    return new Set()
  }
  const mergedRaw = await git.raw(['branch', '--merged', into])
  const ancestryMerged = new Set(
    mergedRaw.split('\n').map(b => b.replace(/^\*?\s+/, '').trim()).filter(Boolean),
  )

  const merged = new Set<string>()
  const rest: string[] = []
  for (const branch of branches) {
    if (ancestryMerged.has(branch)) merged.add(branch)
    else rest.push(branch)
  }
  if (rest.length === 0 || rest.length < (opts?.fallbackThreshold ?? 0)) return merged

  // Resolve all remaining tips + into in ONE subprocess, then run the
  // (mostly cached) patch-id fallback in bounded-concurrency chunks. Each
  // task gets its OWN simple-git instance — a shared instance serializes
  // its command queue, which turns 80 branches into 80 sequential spawns.
  let tips: string[]
  try {
    tips = (await git.raw(['rev-parse', into, ...rest])).trim().split('\n').map(s => s.trim())
  } catch {
    return merged
  }
  const intoTip = tips[0]
  if (!intoTip) return merged
  for (let i = 0; i < rest.length; i += CHERRY_CONCURRENCY) {
    const chunk = rest.slice(i, i + CHERRY_CONCURRENCY)
    const verdicts = await Promise.all(chunk.map((branch, j) => {
      const tip = tips[i + j + 1]
      return tip
        ? isTipMerged(simpleGit(projectRoot), tip, intoTip, DEFAULT_MAX_CHERRY_COMMITS, into)
        : Promise.resolve(false)
    }))
    for (const [j, verdict] of verdicts.entries()) {
      if (verdict) merged.add(chunk[j]!)
    }
  }
  return merged
}

// ─── Remote cr/* branch lifecycle ───

const REMOTE_PUSH_TIMEOUT_MS = 10_000
const REMOTE_LIST_TIMEOUT_MS = 5_000

function contentrainRemoteName(): string {
  return process.env['CONTENTRAIN_REMOTE'] ?? 'origin'
}

/**
 * simple-git instance hardened for network operations: `timeout.block` kills
 * the child after N ms without output (hung SSH passphrase prompts), and
 * `GIT_TERMINAL_PROMPT=0` refuses interactive HTTPS credential prompts.
 *
 * This is the one place that legitimately inherits the real environment — push
 * needs the host's askpass/SSH/proxy setup to authenticate. Because `.env()` is
 * therefore unavoidable, `unsafe` opts out of the block-unsafe guard categories
 * that inherited variables (EDITOR, GIT_ASKPASS, …) would otherwise trip; see
 * NETWORK_UNSAFE. Arg-injection protections stay intact.
 */
function networkGit(projectRoot: string, timeoutMs: number): SimpleGit {
  return simpleGit({ baseDir: projectRoot, timeout: { block: timeoutMs }, unsafe: NETWORK_UNSAFE })
    .env({ ...process.env, GIT_TERMINAL_PROMPT: '0' })
}

async function resolveRemote(git: SimpleGit): Promise<string | null> {
  try {
    const remotes = await git.getRemotes()
    const name = contentrainRemoteName()
    return remotes.some(r => r.name === name) ? name : null
  } catch {
    return null
  }
}

export interface RemoteDeleteResult {
  deleted: boolean
  /** Why nothing was deleted, when that is expected (not a failure). */
  skipped?: 'disabled' | 'no-remote' | 'not-found' | 'protected'
  /** A real failure (offline, auth, protected ref) — surfaced, never thrown. */
  warning?: string
}

/**
 * Best-effort delete of a cr/* branch on the configured remote. Never
 * throws: expected conditions land in `skipped`, real failures in
 * `warning`. Gated by `config.remoteBranchCleanup` (default: on).
 *
 * Pass `opts.config` when the caller already read it (avoids a re-read);
 * `null` means "no config" and applies the default gate.
 */
export async function deleteRemoteBranch(
  projectRoot: string,
  branch: string,
  opts?: { config?: ContentrainConfig | null, timeoutMs?: number },
): Promise<RemoteDeleteResult> {
  if (!branch.startsWith('cr/') || branch === CONTENTRAIN_BRANCH) {
    return { deleted: false, skipped: 'protected' }
  }
  const config = opts?.config === undefined ? await readConfig(projectRoot) : opts.config
  if (!(config?.remoteBranchCleanup ?? true)) {
    return { deleted: false, skipped: 'disabled' }
  }
  const git = networkGit(projectRoot, opts?.timeoutMs ?? REMOTE_PUSH_TIMEOUT_MS)
  const remote = await resolveRemote(git)
  if (!remote) return { deleted: false, skipped: 'no-remote' }
  try {
    await git.push([remote, '--delete', branch])
    return { deleted: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/remote ref does not exist|couldn't find remote ref/i.test(message)) {
      return { deleted: false, skipped: 'not-found' }
    }
    return { deleted: false, warning: `Could not delete "${branch}" on ${remote}: ${message}` }
  }
}

export interface RemoteBranchList {
  remote: string
  branches: { name: string, sha: string }[]
  /** ls-remote failed (offline/timeout) — branches is empty, not authoritative. */
  error?: string
}

/**
 * Authoritative list of cr/* branches on the configured remote via
 * `ls-remote --heads` (no fetch, no stale remote-tracking refs). Returns
 * null when no remote is configured. Never throws.
 */
export async function listRemoteCrBranches(
  projectRoot: string,
  opts?: { timeoutMs?: number },
): Promise<RemoteBranchList | null> {
  const git = networkGit(projectRoot, opts?.timeoutMs ?? REMOTE_LIST_TIMEOUT_MS)
  const remote = await resolveRemote(git)
  if (!remote) return null
  try {
    const raw = await git.raw(['ls-remote', '--heads', remote, 'refs/heads/cr/*'])
    const branches = raw.split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [sha, ref] = line.split('\t')
        return { sha: sha?.trim() ?? '', name: ref?.trim().replace(/^refs\/heads\//, '') ?? '' }
      })
      .filter(b => b.name.startsWith('cr/') && b.name !== CONTENTRAIN_BRANCH)
    return { remote, branches }
  } catch (error) {
    return { remote, branches: [], error: error instanceof Error ? error.message : String(error) }
  }
}

export interface RemotePruneResult {
  /** Branches removed from the remote (in dryRun mode: the candidates). */
  deleted: string[]
  kept: string[]
  errors: string[]
  skipped?: 'disabled' | 'no-remote' | 'offline'
}

const PRUNE_PUSH_CHUNK = 50

/**
 * Delete already-merged cr/* branches on the remote in batches. Merged-state
 * uses the same ancestry + patch-id classification as the local cleanup, so
 * branches leaked before a base-history rewrite are still recognised.
 * Ignores `branchRetention` — a merged remote copy only produces phantom
 * reviews. Never throws; gated by `config.remoteBranchCleanup`.
 */
export async function pruneMergedRemoteBranches(
  projectRoot: string,
  opts?: { config?: ContentrainConfig | null, max?: number, dryRun?: boolean, timeoutMs?: number },
): Promise<RemotePruneResult> {
  const config = opts?.config === undefined ? await readConfig(projectRoot) : opts.config
  if (!(config?.remoteBranchCleanup ?? true)) {
    return { deleted: [], kept: [], errors: [], skipped: 'disabled' }
  }

  const listed = await listRemoteCrBranches(projectRoot, { timeoutMs: opts?.timeoutMs })
  if (!listed) return { deleted: [], kept: [], errors: [], skipped: 'no-remote' }
  if (listed.error) return { deleted: [], kept: [], errors: [listed.error], skipped: 'offline' }
  if (listed.branches.length === 0) return { deleted: [], kept: [], errors: [] }

  const git = networkGit(projectRoot, opts?.timeoutMs ?? REMOTE_PUSH_TIMEOUT_MS)

  // Remote tips may predate this clone (leaked long ago, and our fetches are
  // single-refspec) — one scoped fetch backfills any missing objects.
  // `cat-file -t` (not `-e`): -e signals via exit code with empty stderr,
  // which simple-git reports as success.
  const presence = await Promise.all(listed.branches.map(b =>
    git.raw(['cat-file', '-t', b.sha]).then(() => true).catch(() => false),
  ))
  if (presence.some(present => !present)) {
    try {
      await git.fetch(listed.remote, `+refs/heads/cr/*:refs/remotes/${listed.remote}/cr/*`)
    } catch {
      // Best-effort: branches whose objects stay unresolvable are kept below.
    }
  }

  const kept: string[] = []
  const candidates: string[] = []
  const verdicts = await Promise.all(listed.branches.map(b => isRefMerged(git, b.sha, CONTENTRAIN_BRANCH)))
  for (const [i, merged] of verdicts.entries()) {
    const name = listed.branches[i]!.name
    if (merged) candidates.push(name)
    else kept.push(name)
  }

  const limit = opts?.max ?? Number.POSITIVE_INFINITY
  const toDelete = candidates.slice(0, limit)
  kept.push(...candidates.slice(toDelete.length))

  if (opts?.dryRun) return { deleted: toDelete, kept, errors: [] }

  const deleted: string[] = []
  const errors: string[] = []
  for (let i = 0; i < toDelete.length; i += PRUNE_PUSH_CHUNK) {
    const chunk = toDelete.slice(i, i + PRUNE_PUSH_CHUNK)
    try {
      await git.push([listed.remote, '--delete', ...chunk])
      deleted.push(...chunk)
    } catch {
      // One missing ref fails the whole multi-refspec push — retry per branch.
      for (const branch of chunk) {
        try {
          await git.push([listed.remote, '--delete', branch])
          deleted.push(branch)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          if (/remote ref does not exist|couldn't find remote ref/i.test(message)) {
            deleted.push(branch) // already gone — net effect is pruned
          } else {
            errors.push(`${branch}: ${message}`)
          }
        }
      }
    }
  }
  return { deleted, kept, errors }
}
