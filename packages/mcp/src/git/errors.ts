/**
 * Error normalization for git-backed MCP operations.
 *
 * `simple-git` surfaces a failed `git commit`/`push`/`merge` as a `GitError`
 * whose `message` is the raw subprocess stderr — which, for hook tooling
 * (commitlint, husky, lefthook), is colorized multi-line text. Returning that
 * verbatim inside a JSON error produces an unreadable ANSI-escaped blob.
 *
 * This helper strips ANSI, preserves any structured fields the thrown error
 * already carries (`code`/`agent_hint`/`developer_action`), and detects git
 * hook rejections so the agent gets an actionable, structured envelope.
 */

// Build the ANSI matcher without a literal control char so oxlint's
// no-control-regex rule stays happy.
const ANSI_RE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')

export function stripAnsi(input: string): string {
  return input.replace(ANSI_RE, '')
}

export interface NormalizedError {
  error: string
  stage?: string
  hook?: string
  code?: string
  agent_hint?: string
  developer_action?: string
}

/**
 * Normalize any thrown error into a structured, ANSI-free envelope for MCP
 * tool responses. `stage` labels where it happened (e.g. 'content_save').
 */
export function normalizeOperationError(err: unknown, stage?: string): NormalizedError {
  const e = err as { message?: string, code?: string, agent_hint?: string, developer_action?: string } | undefined
  const rawMessage = e?.message ?? String(err)
  const message = stripAnsi(rawMessage).trim()

  const out: NormalizedError = { error: message }
  if (stage) out.stage = stage
  if (e?.code) out.code = e.code
  if (e?.agent_hint) out.agent_hint = e.agent_hint
  if (e?.developer_action) out.developer_action = e.developer_action

  // Detect a git hook rejection (only when the error isn't already a
  // structured Contentrain error with its own code).
  if (!out.code) {
    const hookName = /\b(commit-msg|pre-commit|prepare-commit-msg|pre-push)\b/i.exec(message)?.[1]
    const hookTool = /\b(commitlint|husky|lefthook)\b/i.exec(message)?.[1]
    if (hookName || hookTool) {
      out.stage = out.stage ?? 'git-commit'
      out.hook = hookName ?? hookTool
      out.agent_hint = out.agent_hint
        ?? 'A git hook rejected the Contentrain commit. Contentrain commits with --no-verify, but a wrapping CLI or server-side hook may still run. Ask the developer to allow machine-generated "[contentrain]" commits or to exclude cr/* branches from the hook.'
    }
  }

  return out
}
