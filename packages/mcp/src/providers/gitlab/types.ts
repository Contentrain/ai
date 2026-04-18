import type { CommitAuthor } from '../../core/contracts/index.js'

/**
 * A reference to a GitLab project.
 *
 * `projectId` accepts the numeric project ID or a URL-encoded path
 * (`namespace/project`). Gitbeaker URL-encodes string paths internally,
 * so either form is fine.
 *
 * `contentRoot` is the repo-relative directory prefix where Contentrain
 * content lives. For a flat content repo it stays `''`; for a monorepo
 * where Contentrain sits under `apps/web/.contentrain/` it holds that
 * prefix. All reader/writer paths are joined against it.
 *
 * `host` points at a self-hosted GitLab instance. Leave undefined to
 * use `https://gitlab.com` (gitbeaker's default).
 */
export interface ProjectRef {
  projectId: string | number
  contentRoot?: string
  host?: string
}

/**
 * Authentication options for the GitLab provider.
 *
 * - `pat` — personal access token with the `api` scope. Simplest for
 *   self-hosted MCP or CI runners.
 * - `oauth` — OAuth2 token. Used when the runner is driven by a GitLab
 *   OAuth flow.
 * - `job` — CI job token (`CI_JOB_TOKEN`). Scoped to the running
 *   pipeline; useful for pipeline-driven content updates.
 */
export type GitLabAuth =
  | { type: 'pat', token: string }
  | { type: 'oauth', oauthToken: string }
  | { type: 'job', jobToken: string }

/** Default author used when a call does not provide one. */
export const DEFAULT_GITLAB_AUTHOR: CommitAuthor = {
  name: 'Contentrain',
  email: 'mcp@contentrain.io',
}
