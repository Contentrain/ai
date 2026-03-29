import { simpleGit } from 'simple-git'
import { CONTENTRAIN_BRANCH } from '@contentrain/types'
import { readConfig } from '../core/config.js'

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
  let mergedRaw = ''
  try {
    mergedRaw = await git.raw(['branch', '--merged', CONTENTRAIN_BRANCH])
  } catch {
    // Contentrain branch may not exist yet (pre-init); fall back to baseBranch
    try {
      mergedRaw = await git.raw(['branch', '--merged', baseBranch])
    } catch {
      // Base branch may not exist either; nothing is merged
      return { deleted: 0, remaining: contentrainBranches.length, deletedBranches: [] }
    }
  }

  const mergedSet = new Set(
    mergedRaw.split('\n').map(b => b.replace(/^\*?\s+/, '').trim()).filter(Boolean),
  )

  const mergedContentrain = contentrainBranches.filter(b => mergedSet.has(b))
  const deletedBranches: string[] = []

  // Determine retention period (days). Default: 7
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
      await git.raw(['branch', '-d', branch])
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

  // Count merged into contentrain branch, falling back to baseBranch
  let mergedCount = 0
  try {
    const mergedRaw = await git.raw(['branch', '--merged', CONTENTRAIN_BRANCH])
    const mergedSet = new Set(
      mergedRaw.split('\n').map(b => b.replace(/^\*?\s+/, '').trim()).filter(Boolean),
    )
    mergedCount = contentrainBranches.filter(b => mergedSet.has(b)).length
  } catch {
    // Contentrain branch may not exist yet (pre-init); fall back to baseBranch
    try {
      const mergedRaw = await git.raw(['branch', '--merged', baseBranch])
      const mergedSet = new Set(
        mergedRaw.split('\n').map(b => b.replace(/^\*?\s+/, '').trim()).filter(Boolean),
      )
      mergedCount = contentrainBranches.filter(b => mergedSet.has(b)).length
    } catch {
      // ignore — neither branch exists
    }
  }

  const unmerged = total - mergedCount
  const warning = unmerged >= 50
  const blocked = unmerged >= 80

  let message: string | undefined
  if (blocked) {
    message = `BLOCKED: ${unmerged} active contentrain branches (limit: 80). Run cleanup or merge/delete old branches before creating new ones.`
  } else if (warning) {
    message = `WARNING: ${unmerged} active contentrain branches. Consider merging or deleting old branches (warning at 50, blocked at 80).`
  }

  return { total, merged: mergedCount, unmerged, warning, blocked, message }
}
