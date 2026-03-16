# Contributing

Thanks for contributing to Contentrain.

This repo publishes the open-source package line for the Contentrain ecosystem:

- `@contentrain/mcp`
- `contentrain`
- `@contentrain/query`
- `@contentrain/types`
- `@contentrain/rules`
- `@contentrain/skills`

The main expectation is simple:

- keep package contracts aligned
- keep changes small and reviewable
- do not merge code that skips quality gates

## Before You Start

Requirements:

- Node.js `22+`
- pnpm `9+`
- Git

Install dependencies:

```bash
pnpm install
```

## Ways To Contribute

- report a bug
- propose a feature
- improve docs
- add tests
- fix package drift across MCP, CLI, SDK, rules, or skills

If a change affects public behavior, include tests and update docs where needed.
If a change affects a published package, add a changeset:

```bash
pnpm changeset
```

## Issues

Please open an issue before large changes.

Good issues include:

- the affected package
- expected behavior
- actual behavior
- a minimal reproduction when possible
- whether the change is user-facing, package-facing, or docs-only

## Pull Requests

Keep PRs focused.

A good PR should:

- target one clear problem or improvement
- explain which package surface changed
- mention breaking changes explicitly
- include or update tests when behavior changes
- update docs when public usage changes

If your change affects multiple packages, explain the dependency between them clearly.

## Quality Gates

Every contribution is expected to pass:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm release:check
```

If your PR changes a publishable package, also include a `.changeset/*.md` entry unless the change is explicitly non-release work.

If you touch a specific package heavily, also run targeted commands for that package.

Examples:

```bash
pnpm --filter @contentrain/mcp test
pnpm --filter contentrain test -- --run
pnpm --filter @contentrain/query test
```

## Repo Conventions

- Use `pnpm`, not `npm install`
- Prefer small commits
- Do not edit generated files unless the source change requires it
- Do not commit build artifacts or release tarballs
- Keep internal and public package surfaces separate

## Commit Style

Use conventional commit style when possible:

- `feat(mcp): ...`
- `fix(cli): ...`
- `docs(readme): ...`
- `chore(release): ...`

## Review Expectations

Review focuses on:

- correctness
- contract drift
- regression risk
- missing tests
- public package impact

Not every contribution needs a large design discussion. But changes to MCP, SDK contracts, release flow, or public package surfaces should be explicit and well-justified.

## Release Notes

Contributors do not need to publish packages manually.

Maintainers handle:

- merging release PRs
- npm publishing
- deprecations
- package tags
- GitHub releases
