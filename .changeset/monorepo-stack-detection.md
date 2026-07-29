---
"@contentrain/mcp": patch
---

Detect the stack from workspace packages in a monorepo

Detection walked *up* from the project root looking for a monorepo root — "I
am inside a package, find the workspace" — but never *down*. The common case
is the opposite: `projectRoot` **is** the monorepo root, and its
`package.json` holds only tooling (`turbo`, `nx`) while the frameworks live in
`apps/*` and `packages/*`. Those projects reported `other`.

That is not cosmetic. The stack is what selects the replacement conventions
during normalize, and the framework guides exist precisely to make Phase 2
patch source the way each framework expects. A Next.js monorepo detected as
`other` sends reuse down a generic path.

`jsoncrack.com`, a real Next.js monorepo, now reports:

```
before: other
after:  next  (monorepo: true, pnpm workspaces)
```

Details:

- Workspace directories come from `pnpm-workspace.yaml` or the `workspaces`
  field. The pnpm file is read line by line rather than with a YAML
  dependency — it is one list of strings with a fixed shape. Only a trailing
  `*` segment is expanded, which covers `apps/*` and `packages/*`; deeper
  globs and negations are skipped rather than half-supported, and the scan is
  capped at 50 directories.
- When several packages match, the highest-priority stack wins rather than
  the most frequent. A monorepo with one Next app and two React-only packages
  is a Next project; counting would answer `react`.
- Feature detection had the same blind spot, so an i18n library installed in
  a workspace package was invisible. It now collects workspace dependencies
  too — reporting "no i18n" for a project that has one would send normalize
  down the wrong path.

Root-level frameworks and non-JS detection are unchanged; a workspace file
does not shadow a `go.mod`.
