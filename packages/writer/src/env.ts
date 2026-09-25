// Environment for every process the writer starts. Built from an allowlist,
// never by copying process.env: the worker's environment holds the Anthropic
// key, database URLs and deploy tokens, and none of them may reach `pnpm`,
// `astro` or anything a project's dependencies run at install or build time.

const PASSED = ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'SystemRoot', 'PNPM_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME'] as const

/** What a build, a check or an install sees: the allowlist plus CI settings. No credentials. */
export function commandEnv(source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const env: Record<string, string> = { CI: 'true', FORCE_COLOR: '0', NO_COLOR: '1', ASTRO_TELEMETRY_DISABLED: '1' }
  for (const name of PASSED) {
    const value = source[name]
    if (value !== undefined) env[name] = value
  }
  return env
}

/**
 * The Agent SDK's child (the Claude Code runtime): the allowlist plus the key it calls the API with.
 * The key comes from the caller, not from process.env. The runtime's own tools are off, so nothing it
 * could start inherits this environment; the writer's tools run in this process with {@link commandEnv}.
 */
export function agentEnv(apiKey: string, source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  if (!apiKey) throw new Error('writer: an API key is required for a model run')
  return {
    ...commandEnv(source),
    ANTHROPIC_API_KEY: apiKey,
    // Builds take minutes; an MCP tool call must not time out under them.
    MCP_TOOL_TIMEOUT: '900000',
    CLAUDE_AGENT_SDK_CLIENT_APP: '@contentrain/writer',
    DISABLE_TELEMETRY: '1',
    DISABLE_AUTOUPDATER: '1',
  }
}
