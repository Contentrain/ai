import type { GitHubClient } from './client.js'
import { GitHubProvider } from './provider.js'
import type { GitHubAuth, RepoRef } from './types.js'

/**
 * Create an Octokit-backed `GitHubClient` from an auth configuration.
 *
 * The `@octokit/rest` module is imported dynamically so it stays a pure
 * optional peer dependency — self-hosted MCP on stdio can run without
 * it. If the module is not installed, the import throws with a helpful
 * hint pointing the operator at the peer dependency.
 *
 * Phase 5.1 ships with PAT auth only. App-based auth (JWT + installation
 * token) lands in phase 5.2 together with the HTTP transport.
 */
export async function createGitHubClient(auth: GitHubAuth): Promise<GitHubClient> {
  if (auth.type !== 'pat') {
    throw new Error(
      `GitHub auth type "${auth.type}" is not yet supported. Phase 5.1 ships with "pat" only; `
      + `"app" installation auth arrives in phase 5.2.`,
    )
  }

  let OctokitCtor: typeof import('@octokit/rest').Octokit
  try {
    ({ Octokit: OctokitCtor } = await import('@octokit/rest'))
  } catch (error) {
    throw new Error(
      '@octokit/rest is required for the GitHubProvider but could not be loaded. '
      + 'Install it as a peer dependency: pnpm add @octokit/rest.',
      { cause: error },
    )
  }

  return new OctokitCtor({ auth: auth.token })
}

/**
 * Factory for the full provider — instantiates an Octokit client and
 * wraps it in a `GitHubProvider`. Consumers who already hold an Octokit
 * instance (HTTP server injecting shared clients, tests, etc.) should
 * instantiate `GitHubProvider` directly instead.
 */
export async function createGitHubProvider(opts: { auth: GitHubAuth, repo: RepoRef }): Promise<GitHubProvider> {
  const client = await createGitHubClient(opts.auth)
  return new GitHubProvider(client, opts.repo)
}
