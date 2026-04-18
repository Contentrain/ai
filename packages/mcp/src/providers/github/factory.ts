import type { GitHubClient } from './client.js'
import { exchangeInstallationToken } from './app-auth.js'
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
 * Two auth modes:
 *
 * - `pat` — personal access token or fine-grained PAT. Simplest for
 *   self-hosted MCP or CI runners.
 * - `app` — GitHub App installation auth. The factory mints a short-
 *   lived JWT, exchanges it for an installation token via
 *   `exchangeInstallationToken`, and instantiates Octokit with the
 *   resulting bearer. The returned token expires in ~1 hour; callers
 *   that need auto-refresh should instead inject their own Octokit
 *   built with `@octokit/auth-app`'s auth strategy and construct
 *   `GitHubProvider` directly. See the embedding guide for trade-offs.
 */
export async function createGitHubClient(auth: GitHubAuth): Promise<GitHubClient> {
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

  if (auth.type === 'pat') {
    return new OctokitCtor({ auth: auth.token })
  }

  if (auth.type === 'app') {
    const { token } = await exchangeInstallationToken({
      appId: auth.appId,
      privateKey: auth.privateKey,
      installationId: auth.installationId,
    })
    return new OctokitCtor({ auth: token })
  }

  const unknown = auth as { type: string }
  throw new Error(`GitHub auth type "${unknown.type}" is not supported. Use "pat" or "app".`)
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
