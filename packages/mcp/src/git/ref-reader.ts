import { type SimpleGit } from 'simple-git'
import { createGit } from './identity.js'
import type { RepoReader } from '../core/contracts/index.js'

/**
 * GitRefReader — `RepoReader` over an arbitrary local git ref, without a
 * checkout. `git show <ref>:<path>` reads blobs, `ls-tree` lists a tree
 * level, `cat-file -e` answers existence. This is what lets a reconcile
 * planner read three trees (merge-base, contentrain, base branch) side by
 * side while the developer's working tree stays untouched.
 *
 * The ref is fixed at construction; the per-call `ref?` parameter of the
 * `RepoReader` contract is ignored — a bound reader answering for a
 * different ref than it was built for would be a lie. Bind another instance
 * instead.
 */
export class GitRefReader implements RepoReader {
  private readonly git: SimpleGit

  constructor(
    public readonly projectRoot: string,
    public readonly ref: string,
  ) {
    this.git = createGit(projectRoot)
  }

  async readFile(path: string, _ref?: string): Promise<string> {
    return this.git.show([`${this.ref}:${normalize(path)}`])
  }

  async listDirectory(path: string, _ref?: string): Promise<string[]> {
    try {
      // Trailing slash = "list the tree at this path", bare names via
      // --name-only; ls-tree is non-recursive by default, matching the
      // contract's "does not recurse".
      const dir = normalize(path)
      const args = dir && dir !== '.'
        ? ['ls-tree', '--name-only', this.ref, `${dir}/`]
        : ['ls-tree', '--name-only', this.ref]
      const raw = await this.git.raw(args)
      return raw
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(entry => entry.slice(entry.lastIndexOf('/') + 1))
    } catch {
      return []
    }
  }

  async fileExists(path: string, _ref?: string): Promise<boolean> {
    try {
      await this.git.raw(['cat-file', '-e', `${this.ref}:${normalize(path)}`])
      return true
    } catch {
      return false
    }
  }
}

/** Strip a trailing slash — `<ref>:dir/` and `<ref>:dir` name different things to git. */
function normalize(path: string): string {
  return path.endsWith('/') ? path.slice(0, -1) : path
}
