import { simpleGit } from 'simple-git'
import { CONTENTRAIN_BRANCH } from '@contentrain/types'
import type { Branch, FileDiff, MergeResult } from '../../core/contracts/index.js'
import { readConfig } from '../../core/config.js'
import { mergeBranch as mergeBranchOp } from '../../git/transaction.js'

/**
 * Branch/merge/diff helpers backed by the local simple-git worktree flow.
 *
 * Pure functions composed into `LocalProvider` — mirroring the shape of
 * `providers/github/branch-ops.ts` so the two providers share the same
 * surface at the `RepoProvider` boundary.
 */

export async function getDefaultBranch(projectRoot: string): Promise<string> {
  const config = await readConfig(projectRoot)
  if (config?.repository?.default_branch) return config.repository.default_branch
  const envBranch = process.env['CONTENTRAIN_BRANCH']
  if (envBranch) return envBranch
  const git = simpleGit(projectRoot)
  const current = (await git.raw(['branch', '--show-current'])).trim()
  return current || 'main'
}

export async function listBranches(
  projectRoot: string,
  prefix?: string,
): Promise<Branch[]> {
  const git = simpleGit(projectRoot)
  const summary = await git.branchLocal()
  const names = prefix
    ? summary.all.filter(n => n.startsWith(prefix))
    : summary.all
  const branches: Branch[] = []
  for (const name of names) {
    const info = summary.branches[name]
    branches.push({ name, sha: info?.commit ?? '' })
  }
  return branches
}

export async function createBranch(
  projectRoot: string,
  name: string,
  fromRef: string,
): Promise<void> {
  const git = simpleGit(projectRoot)
  await git.raw(['branch', name, fromRef])
}

export async function deleteBranch(
  projectRoot: string,
  name: string,
): Promise<void> {
  const git = simpleGit(projectRoot)
  await git.deleteLocalBranch(name, true)
}

export async function getBranchDiff(
  projectRoot: string,
  branch: string,
  base: string,
): Promise<FileDiff[]> {
  const git = simpleGit(projectRoot)
  const raw = await git.raw(['diff', '--name-status', `${base}...${branch}`])
  const diffs: FileDiff[] = []
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    const [code, ...pathParts] = line.split('\t')
    const path = pathParts[pathParts.length - 1]
    if (!code || !path) continue
    const status: FileDiff['status'] = code.startsWith('A')
      ? 'added'
      : code.startsWith('D')
        ? 'removed'
        : 'modified'
    diffs.push({ path, status, before: null, after: null })
  }
  return diffs
}

export async function mergeBranch(
  projectRoot: string,
  branch: string,
  into: string,
): Promise<MergeResult> {
  if (into !== CONTENTRAIN_BRANCH) {
    throw Object.assign(new Error(
      `LocalProvider.mergeBranch only supports merging into "${CONTENTRAIN_BRANCH}" (got "${into}"). `
      + `The local flow merges feature branches into the content-tracking branch and fast-forwards the base branch via update-ref.`,
    ), {
      code: 'UNSUPPORTED_MERGE_TARGET',
      agent_hint: `Pass "${CONTENTRAIN_BRANCH}" as the merge target, or use a non-local provider that supports arbitrary targets.`,
      developer_action: `Merge "${branch}" into "${CONTENTRAIN_BRANCH}" instead.`,
    })
  }
  const result = await mergeBranchOp(projectRoot, branch)
  return {
    merged: true,
    sha: result.commit,
    pullRequestUrl: null,
    sync: result.sync,
  }
}

export async function isMerged(
  projectRoot: string,
  branch: string,
  into: string,
): Promise<boolean> {
  const git = simpleGit(projectRoot)
  try {
    const raw = await git.raw(['branch', '--merged', into])
    const merged = new Set(
      raw.split('\n').map(b => b.replace(/^\*?\s+/, '').trim()).filter(Boolean),
    )
    return merged.has(branch)
  } catch {
    return false
  }
}
