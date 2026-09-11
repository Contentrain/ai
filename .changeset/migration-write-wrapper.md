---
"@contentrain/mcp": minor
---

Allowlisted migration write path — consent, scope, and an audit trail in front of `applyPlan`

A-07. A migration does not deliver content, it delivers a codebase: `src/`,
`public/`, `package.json`, a lockfile, deploy configuration. The content write
path was never built for any of that, and widening it would quietly move a
security boundary the whole product rests on — "Contentrain only writes
`.contentrain/`" is a promise, not an implementation detail.

So this is a wrapper, not a new provider: `GitHubProvider.applyPlan` could
already write any path, and what was missing was a gate in front of it.
`@contentrain/mcp/core/migration` exports `createMigrationWriter`, `scopeHash`
and the allowlist matcher.

- **Scope** — only paths an allowlist pattern covers. `.contentrain/**` is not
  implicit: the content engine's own writes go through the content path with its
  own invariants, so a migration that also wants the store asks for it, and the
  person approving sees that it does.
- **Consent** — one approval, bound to the exact scope by `scope_hash` (sorted,
  de-duplicated patterns; SHA-256 over canonical JSON, like `computePlanHash`).
  An approval of `src/**` cannot be replayed against a scope that also carries
  `.github/workflows/**`.
- **Branch** — a `migration/*` ref. The `contentrain` branch is never a target
  and never a base, including through `ApplyPlanInput`'s default base, which is
  an invariant written for content writes and exactly what a migration must not
  inherit.
- **Trail** — one `MigrationAuditEntry` per file: step, path, action, the
  pattern that allowed it, actor, timestamp, commit. An optional shared array
  means one run has one trail across several writers.
- **Undo** — one branch, one PR, one `git revert`.

Every refusal happens before the provider is called, and a plan is refused
whole: a plan with one path outside the scope writes nothing at all, not even
its allowed part. A half-applied migration is harder to recover from than one
that never started.

The path matcher is a security control and fails closed. Traversal, absolute
paths, backslash separators, percent-encoding, empty segments, control
characters and absurd lengths are refused before a pattern is consulted;
patterns are anchored at both ends, so `src/*` does not cover `src/a/b`; and
regex metacharacters in a pattern are escaped, so an allowlist entry cannot
silently cover more than it reads.

Test coverage: 40 tests. Every refusal the matcher must make, `scopeHash`
order- and duplicate-independence, the whole-plan refusal (asserting the
provider recorded no commit and the trail stayed empty), both content-branch
guards including the inherited default base, a branch the approval does not
cover, consent for a different scope, and expiry.
