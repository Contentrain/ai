import { CONTENTRAIN_BRANCH } from '@contentrain/types'
import type {
  ApplyPlanInput,
  Branch,
  Commit,
  FileChange,
  FileDiff,
  MergeResult,
  ProviderCapabilities,
  RepoProvider,
  WriteReadiness,
} from '../core/contracts/index.js'

/**
 * MemoryProvider — a complete `RepoProvider` backed by `Map`s.
 *
 * Why this exists: the write-side tool tests were spending their entire
 * wall-clock in `posix_spawn`. A `contentrain_init` costs 33 git subprocesses
 * and a content save 26, and on macOS each one is dominated by fork cost
 * rather than by git. Tests that assert "does model_save reject an invalid
 * field type" were paying for worktree creation, merge and ref surgery to
 * find out.
 *
 * None of that is what those tests are about. The provider contract is the
 * seam the engine was already built around — `@contentrain/types` names "a
 * mock in a test suite" as a legitimate implementation — so this fills it in
 * and the tool layer runs unchanged, with zero subprocesses.
 *
 * What it is faithful about, because tests depend on it:
 *   - branches are real snapshots, forked from `base` at fork time, so a
 *     write to a `cr/*` branch is invisible on `contentrain` until it merges
 *   - the workflow decision reads the project's own `config.json`, so
 *     auto-merge and review are both genuinely exercised
 *   - `listDirectory` returns immediate children only, and directories
 *     without a trailing entry still report as existing, matching `readdir`
 *
 * What it deliberately does not model: conflicts, worktrees, selective sync
 * into a developer's working tree, and anything else whose behaviour is a
 * property of git rather than of Contentrain. A test that needs those needs a
 * real repository — keep those, and only those, on the git fixture path.
 */

const MEMORY_CAPABILITIES: ProviderCapabilities = {
  // True: this provider owns the merge decision, exactly as a worktree does.
  // The tool layer branches on this to choose the auto-merge path, which is
  // the path most write tests are actually about.
  localWorktree: true,
  sourceRead: true,
  sourceWrite: true,
  pushRemote: false,
  branchProtection: false,
  pullRequestFallback: false,
  astScan: false,
}

export interface MemoryProviderOptions {
  /** Seed files, keyed by repo-relative path. */
  files?: Record<string, string>
  /** Override the capability set — e.g. to exercise the remote-provider path. */
  capabilities?: Partial<ProviderCapabilities>
  /** Refuse writes, as a local repo does under branch pressure. */
  writeReadiness?: WriteReadiness
}

/** A commit as recorded by the provider, with the changes that produced it. */
export interface RecordedCommit extends Commit {
  branch: string
  changes: FileChange[]
}

type Tree = Map<string, string>

export class MemoryProvider implements RepoProvider {
  readonly capabilities: ProviderCapabilities

  /** Every commit in order, with its changes — the assertion surface. */
  readonly commits: RecordedCommit[] = []

  private readonly refs = new Map<string, Tree>()
  private writeReadiness: WriteReadiness
  private sequence = 0

  constructor(options: MemoryProviderOptions = {}) {
    this.capabilities = { ...MEMORY_CAPABILITIES, ...options.capabilities }
    this.writeReadiness = options.writeReadiness ?? { blocked: false }
    this.refs.set(CONTENTRAIN_BRANCH, new Map(Object.entries(options.files ?? {})))
  }

  // ─── Inspection (test surface, not part of RepoProvider) ───

  /** Whole tree of a ref as a plain object — snapshot-friendly. */
  snapshot(ref: string = CONTENTRAIN_BRANCH): Record<string, string> {
    return Object.fromEntries([...(this.refs.get(ref) ?? new Map())].toSorted(
      ([a], [b]) => a.localeCompare(b, 'en'),
    ))
  }

  /** Every path on a ref, sorted. */
  paths(ref: string = CONTENTRAIN_BRANCH): string[] {
    return [...(this.refs.get(ref) ?? new Map()).keys()].toSorted((a, b) => a.localeCompare(b, 'en'))
  }

  /** Seed or overwrite a file without going through a commit. */
  seed(path: string, content: string, ref: string = CONTENTRAIN_BRANCH): void {
    this.tree(ref).set(path, content)
  }

  /** Start refusing (or accepting) writes, as branch pressure would. */
  setWriteReadiness(readiness: WriteReadiness): void {
    this.writeReadiness = readiness
  }

  // ─── RepoReader ───

  readFile(path: string, ref?: string): Promise<string> {
    const content = this.tree(ref ?? CONTENTRAIN_BRANCH).get(normalize(path))
    if (content === undefined) {
      return Promise.reject(new Error(`ENOENT: no such file, open '${path}'`))
    }
    return Promise.resolve(content)
  }

  listDirectory(path: string, ref?: string): Promise<string[]> {
    const prefix = normalize(path) === '' ? '' : `${normalize(path)}/`
    const names = new Set<string>()
    for (const key of this.tree(ref ?? CONTENTRAIN_BRANCH).keys()) {
      if (!key.startsWith(prefix)) continue
      const rest = key.slice(prefix.length)
      if (rest === '') continue
      // Immediate child only: a nested path contributes its directory name.
      names.add(rest.split('/')[0]!)
    }
    return Promise.resolve([...names].toSorted((a, b) => a.localeCompare(b, 'en')))
  }

  fileExists(path: string, ref?: string): Promise<boolean> {
    const target = normalize(path)
    const tree = this.tree(ref ?? CONTENTRAIN_BRANCH)
    if (tree.has(target)) return Promise.resolve(true)
    // Directories exist implicitly, the way they do on a filesystem.
    const prefix = `${target}/`
    for (const key of tree.keys()) {
      if (key.startsWith(prefix)) return Promise.resolve(true)
    }
    return Promise.resolve(false)
  }

  // ─── RepoWriter ───

  checkWriteReadiness(): Promise<WriteReadiness> {
    return Promise.resolve(this.writeReadiness)
  }

  async applyPlan(input: ApplyPlanInput): Promise<Commit> {
    const base = input.base ?? CONTENTRAIN_BRANCH
    // Fork at write time, like a real branch: the feature branch sees base as
    // it is now, and later base commits do not leak into it.
    const tree = new Map(this.refs.get(input.branch) ?? this.tree(base))
    for (const change of input.changes) {
      if (change.content === null) tree.delete(normalize(change.path))
      else tree.set(normalize(change.path), change.content)
    }
    this.refs.set(input.branch, tree)

    const workflow = input.workflowOverride ?? await this.readWorkflow(base)
    const autoMerge = this.capabilities.localWorktree && workflow === 'auto-merge'
    if (autoMerge) this.refs.set(base, new Map(tree))

    const commit: RecordedCommit = {
      sha: `mem${(++this.sequence).toString().padStart(9, '0')}`,
      message: input.message,
      author: input.author,
      // Fixed, not `new Date()`: a timestamp that moves makes every snapshot
      // assertion a false failure.
      timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, this.sequence)).toISOString(),
      branch: input.branch,
      changes: input.changes,
      ...(this.capabilities.localWorktree
        ? { workflowAction: autoMerge ? 'auto-merged' as const : 'pending-review' as const }
        : {}),
    }
    this.commits.push(commit)
    return commit
  }

  // ─── Branches ───

  listBranches(prefix?: string): Promise<Branch[]> {
    const names = [...this.refs.keys()].filter(n => !prefix || n.startsWith(prefix))
    return Promise.resolve(names.toSorted((a, b) => a.localeCompare(b, 'en')).map(name => ({
      name,
      sha: this.commits.findLast(c => c.branch === name)?.sha ?? 'mem000000000',
    })))
  }

  createBranch(name: string, fromRef?: string): Promise<void> {
    this.refs.set(name, new Map(this.tree(fromRef ?? CONTENTRAIN_BRANCH)))
    return Promise.resolve()
  }

  deleteBranch(name: string): Promise<void> {
    this.refs.delete(name)
    return Promise.resolve()
  }

  getBranchDiff(branch: string, base?: string): Promise<FileDiff[]> {
    const head = this.tree(branch)
    const root = this.tree(base ?? CONTENTRAIN_BRANCH)
    const diffs: FileDiff[] = []
    for (const [path, after] of head) {
      const before = root.get(path) ?? null
      if (before === after) continue
      diffs.push({ path, status: before === null ? 'added' : 'modified', before, after })
    }
    for (const [path, before] of root) {
      if (!head.has(path)) diffs.push({ path, status: 'removed', before, after: null })
    }
    return Promise.resolve(diffs.toSorted((a, b) => a.path.localeCompare(b.path, 'en')))
  }

  mergeBranch(branch: string, into: string, opts?: { removeSourceBranch?: boolean }): Promise<MergeResult> {
    const source = this.refs.get(branch)
    if (!source) return Promise.resolve({ merged: false, sha: null, pullRequestUrl: null })
    this.refs.set(into, new Map(source))
    if (opts?.removeSourceBranch) this.refs.delete(branch)
    return Promise.resolve({
      merged: true,
      sha: this.commits.findLast(c => c.branch === branch)?.sha ?? null,
      pullRequestUrl: null,
    })
  }

  isMerged(branch: string, into?: string): Promise<boolean> {
    const head = this.refs.get(branch)
    if (!head) return Promise.resolve(true)
    const target = this.tree(into ?? CONTENTRAIN_BRANCH)
    for (const [path, content] of head) {
      if (target.get(path) !== content) return Promise.resolve(false)
    }
    return Promise.resolve(true)
  }

  getDefaultBranch(): Promise<string> {
    return Promise.resolve('main')
  }

  // ─── Internals ───

  private tree(ref: string): Tree {
    let tree = this.refs.get(ref)
    if (!tree) {
      tree = new Map()
      this.refs.set(ref, tree)
    }
    return tree
  }

  private async readWorkflow(ref: string): Promise<'auto-merge' | 'review'> {
    try {
      const raw = await this.readFile('.contentrain/config.json', ref)
      const workflow = (JSON.parse(raw) as { workflow?: unknown }).workflow
      return workflow === 'review' ? 'review' : 'auto-merge'
    } catch {
      return 'auto-merge'
    }
  }
}

/** Repo-relative, forward-slash, no leading `./` — the contract's path shape. */
function normalize(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+$/, '')
}
