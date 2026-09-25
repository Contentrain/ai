import { AsyncLocalStorage } from 'node:async_hooks'
import { readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { CONTENTRAIN_BRANCH, type ContentReadSource } from '@contentrain/types'
import { readConfig } from '../../core/config.js'
import { resolveBaseBranch } from '../../git/base-branch.js'
import { createGit } from '../../git/identity.js'
import { loadRefSnapshot, type RefSnapshotReader } from '../../git/ref-snapshot.js'

/**
 * Where a LocalProvider reads `.contentrain/` from (#229).
 *
 * Content writes land on `contentrain` and the base branch; a checked-out
 * feature branch is deliberately left alone (#227). Its working tree is then
 * behind every write, so reading `.contentrain/` from it plans the next write
 * from a stale value and shows read tools stale content. On such a branch the
 * content is read from the `contentrain` ref instead. Everything else — source
 * files, scan, normalize — still comes from the working tree.
 *
 * Working tree, unchanged from before, when:
 * - the base branch is checked out (writes advance it, so it is current once
 *   pulled — #226's carry-over and `CONTENT_WORKING_TREE_STALE` still apply);
 * - HEAD is detached (a CI checkout validates the commit it checked out);
 * - HEAD is `contentrain` itself or a `cr/*` review branch (their tree IS
 *   the content under review);
 * - there is no `contentrain` branch yet, or git cannot answer.
 */
export type ContentView =
  | { source: 'working_tree' }
  | { source: 'ref', ref: string, commit: string, branch: string, reader: RefSnapshotReader, prefix: string }

/** The `.contentrain` paths that are never committed: always the working tree. */
const UNTRACKED = ['.contentrain/.cache', '.contentrain/client']

const scope = new AsyncLocalStorage<Map<string, Promise<ContentView>>>()

/**
 * Run `fn` with one content view per project for its whole duration: every
 * read inside answers from the same snapshot, resolved once. The MCP server
 * wraps each tool call in this, so a call costs a fixed handful of spawns
 * however many files it reads.
 */
export function withReadScope<T>(fn: () => T): T {
  return scope.run(new Map(), fn)
}

export function contentView(projectRoot: string): Promise<ContentView> {
  const memo = scope.getStore()
  if (!memo) return resolveView(projectRoot)
  let view = memo.get(projectRoot)
  if (!view) {
    view = resolveView(projectRoot)
    memo.set(projectRoot, view)
  }
  return view
}

export function describeSource(view: ContentView): ContentReadSource {
  return view.source === 'working_tree'
    ? { source: 'working_tree' }
    : { source: 'ref', ref: view.ref, commit: view.commit, checked_out: view.branch }
}

/**
 * The repo-relative path a snapshot answers for, or null when `path` must come
 * from the working tree (outside `.contentrain/`, or never committed).
 */
export function refPath(view: ContentView & { source: 'ref' }, projectRoot: string, path: string): string | null {
  const abs = resolve(projectRoot, path)
  const root = resolve(projectRoot)
  if (abs !== root && !abs.startsWith(`${root}/`) && !abs.startsWith(`${root}\\`)) return null
  const rel = abs.slice(root.length + 1).replaceAll('\\', '/')
  if (rel !== '.contentrain' && !rel.startsWith('.contentrain/')) return null
  if (UNTRACKED.some(p => rel === p || rel.startsWith(`${p}/`))) return null
  return view.prefix + rel
}

async function resolveView(projectRoot: string): Promise<ContentView> {
  try {
    const head = await headBranch(projectRoot)
    if (!head || head === CONTENTRAIN_BRANCH || head.startsWith('cr/')) return { source: 'working_tree' }
    const git = createGit(projectRoot)
    const base = await resolveBaseBranch(git, await readConfig(projectRoot), { currentBranch: head })
    if (head === base) return { source: 'working_tree' }
    const [prefix, commit] = (await git.raw(['rev-parse', '--show-prefix', `refs/heads/${CONTENTRAIN_BRANCH}^{commit}`]))
      .split('\n').map(line => line.trim())
    if (!commit) return { source: 'working_tree' }
    const root = `${prefix ?? ''}.contentrain`
    const reader = await loadRefSnapshot(projectRoot, commit, root)
    return { source: 'ref', ref: CONTENTRAIN_BRANCH, commit, branch: head, reader, prefix: prefix ?? '' }
  } catch {
    return { source: 'working_tree' }
  }
}

/**
 * The checked-out branch, or null when HEAD is detached. Read from the HEAD
 * file when `.git` sits at the project root (no spawn — this runs once per
 * tool call on every local project); asked of git otherwise (a linked
 * worktree, or a project in a monorepo subdirectory).
 */
async function headBranch(projectRoot: string): Promise<string | null> {
  const dotGit = join(projectRoot, '.git')
  try {
    let gitDir = dotGit
    if ((await stat(dotGit)).isFile()) {
      const pointer = (await readFile(dotGit, 'utf-8')).match(/^gitdir:\s*(.+)$/m)?.[1]?.trim()
      if (!pointer) throw new Error('unreadable .git file')
      gitDir = resolve(projectRoot, pointer)
    }
    const head = (await readFile(join(gitDir, 'HEAD'), 'utf-8')).trim()
    return head.startsWith('ref: refs/heads/') ? head.slice('ref: refs/heads/'.length) : null
  } catch {
    const out = await createGit(projectRoot).raw(['symbolic-ref', '-q', '--short', 'HEAD']).catch(() => '')
    return out.trim() || null
  }
}
