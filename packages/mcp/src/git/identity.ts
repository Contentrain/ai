/**
 * Git identity + guard-safe `simple-git` construction for MCP write operations.
 *
 * simple-git >= 3.34 bundles `@simple-git/argv-parser`, whose block-unsafe
 * guard rejects a `git` invocation when any of ~18 "unsafe" variables (EDITOR,
 * GIT_ASKPASS, PAGER, GIT_SSH_COMMAND, GIT_PROXY_COMMAND, …) is passed
 * EXPLICITLY through `.env()`. Crucially, the guard only scans the object
 * handed to `.env()` — it never inspects the inherited process environment.
 *
 * The rule this module enforces: NEVER spread `process.env` into `.env()`.
 *   - Commit identity is supplied as `-c user.*` config (guard-safe: `user.name`
 *     / `user.email` are not on any unsafe list, and git honours them for both
 *     the author and the committer). See {@link authorConfig}.
 *   - The rare instance that genuinely needs the inherited environment — network
 *     push/fetch, which relies on the host's askpass/SSH/proxy setup to
 *     authenticate — opts out of the affected guard categories via `unsafe`
 *     instead of hiding the environment. See {@link NETWORK_UNSAFE}.
 */

import { accessSync, constants } from 'node:fs'
import { delimiter, isAbsolute, join } from 'node:path'
import { simpleGit, type SimpleGit, type SimpleGitOptions } from 'simple-git'

const DEFAULT_AUTHOR_NAME = 'Contentrain'
const DEFAULT_AUTHOR_EMAIL = 'ai@contentrain.io'

/**
 * Absolute path to the `git` executable, resolved once per process.
 *
 * Every write here spawns git dozens of times — a `contentrain_init` is 33
 * spawns — and spawning by bare name makes the OS re-walk `PATH` on each one.
 * That walk is not free: a developer PATH is commonly 40-50 entries, only one
 * of which holds git, and each miss costs a failed `stat`. Measured on macOS,
 * a spawn by name costs ~211ms against ~16ms for the same spawn by absolute
 * path, and an `init` drops from ~9.4s to ~2.2s.
 *
 * A malformed entry makes it far worse: a PATH containing `/usr/bin/git`
 * (the binary itself, mistaken for a directory) turns every probe into an
 * `ENOTDIR` that measured ~311ms on its own.
 *
 * This is not a test-only concern. An MCP server launched from an editor
 * inherits that editor's PATH, so the shipped product pays the same cost on
 * every write.
 *
 * Resolution is deliberately conservative: the first PATH entry that holds an
 * executable `git`, which is the same one the OS would have picked. We do not
 * try to bypass the macOS `xcode-select` shim — it exists to track the active
 * toolchain, and second-guessing it would trade correctness for ~10ms.
 */
let resolvedBinary: string | undefined

export function gitBinary(): string {
  if (resolvedBinary !== undefined) return resolvedBinary

  const override = process.env['CONTENTRAIN_GIT_BINARY']
  if (override && isAbsolute(override)) {
    resolvedBinary = override
    return resolvedBinary
  }

  const isWindows = process.platform === 'win32'
  const names = isWindows ? ['git.exe', 'git.cmd', 'git'] : ['git']
  for (const dir of (process.env['PATH'] ?? '').split(delimiter)) {
    if (!dir) continue
    for (const name of names) {
      const candidate = join(dir, name)
      try {
        accessSync(candidate, constants.X_OK)
        resolvedBinary = candidate
        return resolvedBinary
      } catch { /* next candidate */ }
    }
  }

  // Not found on PATH — hand back the bare name so the failure surfaces from
  // git itself with its usual message rather than from this resolver.
  resolvedBinary = 'git'
  return resolvedBinary
}

/** Reset the cached binary. Tests only. */
export function resetGitBinary(): void {
  resolvedBinary = undefined
}

/**
 * The single constructor for every `simple-git` instance in this package.
 *
 * Exists so the resolved binary (above) cannot be forgotten at a call site —
 * there were 41 of them, and one that spawns by bare name silently gives back
 * the 13× penalty for that code path only.
 */
export function createGit(baseDir?: string, options?: Partial<SimpleGitOptions>): SimpleGit {
  const merged = { ...options, binary: gitBinary() }
  return baseDir === undefined ? simpleGit(merged) : simpleGit(baseDir, merged)
}

/**
 * Commit identity as `-c` config entries for `simpleGit(dir, { config })`.
 * Passed as arguments (not env) so the block-unsafe guard is never triggered,
 * regardless of what the host process exports. Sets author + committer alike.
 */
export function authorConfig(): string[] {
  const name = process.env['CONTENTRAIN_AUTHOR_NAME'] ?? DEFAULT_AUTHOR_NAME
  const email = process.env['CONTENTRAIN_AUTHOR_EMAIL'] ?? DEFAULT_AUTHOR_EMAIL
  return [`user.name=${name}`, `user.email=${email}`]
}

/**
 * Guard opt-outs for network `git` instances that MUST inherit the real
 * environment (credential askpass helpers, SSH agent, proxy) to authenticate a
 * push/fetch. Covers every guard category reachable from an inherited env var,
 * so the command never trips regardless of what the host (VS Code, CI) exports
 * — while still leaving arg-injection protections (custom binaries, `ext::`
 * protocol, `--upload-pack`) intact.
 */
export const NETWORK_UNSAFE = {
  allowUnsafeAskPass: true,
  allowUnsafeConfigEnvCount: true,
  allowUnsafeConfigPaths: true,
  allowUnsafeDiffExternal: true,
  allowUnsafeEditor: true,
  allowUnsafeGitProxy: true,
  allowUnsafePager: true,
  allowUnsafeSshCommand: true,
  allowUnsafeTemplateDir: true,
}
