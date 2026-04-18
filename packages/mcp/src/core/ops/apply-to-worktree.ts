import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { FileChange } from '../contracts/index.js'

/**
 * Phase 2 shim — applies a `FileChange[]` to a local worktree directory.
 *
 * Phase 3 replaces this with `LocalProvider.applyPlan` (same logic, owned by
 * the provider) while a `GitHubProvider.applyPlan` produces the equivalent
 * commit through the Git Data API. Until then, tool handlers call this shim
 * inside the existing `createTransaction` flow so Phase 2 gets plan/apply
 * semantics without rewriting the transaction machinery.
 *
 * - `content: string` → `writeFile` (creates parent dirs).
 * - `content: null` → `rm`; missing files are tolerated.
 * - Changes are applied in their given order; callers should sort for
 *   determinism.
 */
export async function applyChangesToWorktree(worktree: string, changes: readonly FileChange[]): Promise<void> {
  for (const change of changes) {
    const absolute = join(worktree, change.path)
    if (change.content === null) {
      await rm(absolute, { force: true }).catch(() => { /* tolerate missing */ })
      continue
    }
    await mkdir(dirname(absolute), { recursive: true })
    await writeFile(absolute, change.content, 'utf-8')
  }
}
