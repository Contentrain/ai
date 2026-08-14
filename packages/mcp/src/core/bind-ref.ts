import type { RepoReader } from './contracts/index.js'

/**
 * Pin a `RepoReader` to one ref. The reconcile planner takes three of these
 * (merge-base / contentrain / base branch) and stays entirely ignorant of
 * refs — executors and tools decide what to bind, the planner just reads.
 *
 * For readers that honour the per-call `ref?` parameter (GitHub, GitLab)
 * this is the whole story; a reader that ignores it (LocalReader reads the
 * working tree) needs a ref-aware implementation instead — see
 * `git/ref-reader.ts`.
 */
export function bindRef(reader: RepoReader, ref: string): RepoReader {
  return {
    readFile: path => reader.readFile(path, ref),
    listDirectory: path => reader.listDirectory(path, ref),
    fileExists: path => reader.fileExists(path, ref),
  }
}
