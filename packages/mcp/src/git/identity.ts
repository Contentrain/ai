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

const DEFAULT_AUTHOR_NAME = 'Contentrain'
const DEFAULT_AUTHOR_EMAIL = 'ai@contentrain.io'

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
