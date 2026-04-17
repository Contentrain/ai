import type { Octokit } from '@octokit/rest'

/**
 * GitHubClient — a typed alias for an `@octokit/rest` instance.
 *
 * We rely on the peer-installed `@octokit/rest` for its types only; the
 * provider code never imports Octokit eagerly. Consumers install it
 * themselves via the optional peer dependency; the factory in
 * `factory.ts` `await import()`s Octokit at runtime so the rest of MCP
 * stays usable without it.
 */
export type GitHubClient = Octokit
