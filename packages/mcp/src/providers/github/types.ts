import type { CommitAuthor } from '../../core/contracts/index.js'

/**
 * A reference to a GitHub repository.
 *
 * `contentRoot` is the repo-relative directory prefix where Contentrain
 * content lives. For a flat content repo it stays `''`; for a monorepo
 * where Contentrain is embedded (e.g. `apps/web/.contentrain/`) it holds
 * that prefix. All reader/writer paths are joined against it.
 */
export interface RepoRef {
  owner: string
  name: string
  contentRoot?: string
}

/**
 * Authentication options for the GitHub provider.
 *
 * - `pat` — a personal access token or fine-grained PAT. Simplest for
 *   self-hosted MCP or CI runners. Phase 5.1 ships with this mode only.
 * - `app` — GitHub App installation auth (JWT + installation token
 *   exchange). Planned for Phase 5.2; see `.internal/refactor/
 *   02-studio-handoff.md` S6 for how Studio's hosted MCP plugs in.
 */
export type GitHubAuth =
  | { type: 'pat', token: string }
  | {
      type: 'app'
      appId: number
      privateKey: string
      installationId: number
    }

/** Default author used when a call does not provide one. */
export const DEFAULT_GITHUB_AUTHOR: CommitAuthor = {
  name: 'Contentrain',
  email: 'mcp@contentrain.io',
}
