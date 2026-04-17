import { access, readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { RepoReader } from '../../core/contracts/index.js'

/**
 * LocalReader — `RepoReader` backed by the local filesystem.
 *
 * Paths may be absolute or relative to `projectRoot` (`node:path/resolve`
 * handles both). The `ref` parameter is accepted for interface compatibility
 * but ignored because LocalReader always reads from the working tree.
 *
 * Phase 1: provided as plumbing; core ops still use direct `fs` calls.
 * Phase 2 routes ops through this reader (and through GitHubProvider's reader
 * in Phase 5) so the same op surface works on every backing store.
 */
export class LocalReader implements RepoReader {
  constructor(public readonly projectRoot: string) {}

  async readFile(path: string, _ref?: string): Promise<string> {
    return readFile(resolve(this.projectRoot, path), 'utf-8')
  }

  async listDirectory(path: string, _ref?: string): Promise<string[]> {
    try {
      return await readdir(resolve(this.projectRoot, path))
    } catch {
      return []
    }
  }

  async fileExists(path: string, _ref?: string): Promise<boolean> {
    try {
      await access(resolve(this.projectRoot, path))
      return true
    } catch {
      return false
    }
  }
}
