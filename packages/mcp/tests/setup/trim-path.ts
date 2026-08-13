import { accessSync, constants } from 'node:fs'
import { delimiter, join } from 'node:path'

/**
 * Drop every PATH entry that cannot contribute an executable we actually call.
 *
 * Spawning by bare name makes the OS walk PATH per spawn. In a bare Node
 * process that walk is nearly free (~0.3ms/entry); inside a vitest worker it
 * is not — measured on this suite, `git --version` costs 198.8ms resolved by
 * name against 22.0ms by absolute path, a 9x difference on a 41-entry PATH.
 * Why vitest amplifies the per-probe cost is unexplained; the effect is
 * reproducible and large, so we stop paying it rather than wait for a cause.
 *
 * A malformed entry is worse still: this machine's PATH contained
 * `/usr/bin/git` — the binary itself, added as if it were a directory — so
 * every probe stat'ed `/usr/bin/git/git` and took an ENOTDIR.
 *
 * Pruning only removes entries that are not directories. It never reorders,
 * so resolution still picks whatever the OS would have picked.
 */
const before = (process.env['PATH'] ?? '').split(delimiter)
const after = before.filter((dir) => {
  if (!dir) return false
  try {
    accessSync(dir, constants.X_OK)
    return true
  } catch {
    return false
  }
})

// Keep at least the system directories, in case a sandbox hides everything.
process.env['PATH'] = (after.length > 0 ? after : ['/usr/bin', '/bin']).join(delimiter)

/** Absolute path to git, for tests that spawn it directly. */
export function resolveGit(): string {
  for (const dir of (process.env['PATH'] ?? '').split(delimiter)) {
    const candidate = join(dir, 'git')
    try {
      accessSync(candidate, constants.X_OK)
      return candidate
    } catch { /* next */ }
  }
  return 'git'
}
