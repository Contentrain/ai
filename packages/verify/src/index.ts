// @contentrain/verify — portable gates for a migrated site.
//
// Identity, indexing, status, hreflang, structured data, navigation and assets,
// checked over documents the caller already has. It never fetches: a hardened
// crawler is a security surface of its own and belongs where that hardening
// lives, not in the MIT library every consumer embeds.
//
// The result is a gate that runs the same way over a `dist/` directory, inside
// another tool's pipeline, and in CI — with no network and no mocking.

export { verify, formatReport } from './verify.js'
export { CHECK_GROUPS } from './types.js'
export type {
  CheckGroup,
  Finding,
  Severity,
  VerifyDocument,
  VerifyInput,
  VerifyOptions,
  VerifyRedirect,
  VerifyReport,
} from './types.js'
export { loadSiteDirectory } from './load.js'
