import type { GitLabClient } from './client.js'
import { GitLabProvider } from './provider.js'
import type { GitLabAuth, ProjectRef } from './types.js'

/**
 * Create a gitbeaker-backed `GitLabClient` from an auth configuration.
 *
 * The `@gitbeaker/rest` module is imported dynamically so it stays a
 * pure optional peer dependency — self-hosted MCP on stdio runs fine
 * without it. If the module is not installed, the import throws with
 * a helpful hint pointing the operator at the peer dependency.
 *
 * Supported auth types: `pat`, `oauth`, `job`. All three are thin
 * wrappers over gitbeaker's `token`, `oauthToken`, and `jobToken`
 * constructor options.
 */
export async function createGitLabClient(
  auth: GitLabAuth,
  host?: string,
): Promise<GitLabClient> {
  let GitlabCtor: typeof import('@gitbeaker/rest').Gitlab
  try {
    ({ Gitlab: GitlabCtor } = await import('@gitbeaker/rest'))
  } catch (error) {
    throw new Error(
      '@gitbeaker/rest is required for the GitLabProvider but could not be loaded. '
      + 'Install it as a peer dependency: pnpm add @gitbeaker/rest.',
      { cause: error },
    )
  }

  const config: Record<string, unknown> = host ? { host } : {}
  switch (auth.type) {
    case 'pat':
      config.token = auth.token
      break
    case 'oauth':
      config.oauthToken = auth.oauthToken
      break
    case 'job':
      config.jobToken = auth.jobToken
      break
    default: {
      const { type } = auth as { type: string }
      throw new Error(`Unsupported GitLab auth type: "${type}"`)
    }
  }

  return new GitlabCtor(config) as GitLabClient
}

/**
 * Factory for the full provider — instantiates a gitbeaker client and
 * wraps it in a `GitLabProvider`. Consumers who already hold a
 * gitbeaker instance (HTTP server injecting shared clients, tests,
 * etc.) should instantiate `GitLabProvider` directly instead.
 */
export async function createGitLabProvider(
  opts: { auth: GitLabAuth, project: ProjectRef },
): Promise<GitLabProvider> {
  const client = await createGitLabClient(opts.auth, opts.project.host)
  return new GitLabProvider(client, opts.project)
}
