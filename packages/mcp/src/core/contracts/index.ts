// ─── RepoProvider contracts ───
//
// The canonical definitions live in `@contentrain/types/provider` so
// third-party tools can implement a custom provider without depending on
// @contentrain/mcp. This barrel re-exports them for MCP's internal
// imports and for consumers who have been using
// `@contentrain/mcp/core/contracts` directly.
export type {
  ApplyPlanInput,
  Branch,
  Commit,
  CommitAuthor,
  FileChange,
  FileDiff,
  MergeResult,
  ProviderCapabilities,
  RepoProvider,
  RepoReader,
  RepoWriter,
} from '@contentrain/types'
export { LOCAL_CAPABILITIES } from '@contentrain/types'
