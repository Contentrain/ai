# Releasing Contentrain

Contentrain uses [Changesets](https://github.com/changesets/changesets) as the single source of truth for package versioning, changelogs, tags, and npm publishing.

## 🧭 Standard Flow

For contributors:

```bash
pnpm changeset
```

That creates a `.changeset/*.md` file describing:

- which package changed
- whether the bump is `patch`, `minor`, or `major`
- the changelog summary

For maintainers:

```bash
pnpm version-packages
pnpm release
```

In normal operation you do **not** run those commands locally. GitHub Actions handles them automatically.

## 🤖 Automated Release Flow

The `Release` workflow runs on pushes to `main` and uses `changesets/action`.

It does one of two things:

1. If there are unreleased changesets, it opens or updates a release PR.
2. If the release PR has been merged, it publishes changed packages to npm and creates package tags and GitHub releases.

This is the expected day-to-day flow:

1. Contributors merge PRs with changesets.
2. GitHub updates the release PR.
3. A maintainer reviews and merges that PR.
4. GitHub publishes packages and writes changelogs automatically.

## 📝 Changelogs

Changesets updates `CHANGELOG.md` files automatically for the packages included in a release.

Changelog entries come from the text written in `.changeset/*.md`.

## 🏷 Tags

Tags are package-specific, not monorepo-global.

Examples:

- `@contentrain/mcp@1.0.1`
- `@contentrain/query@5.1.0`
- `contentrain@0.2.0`

This is the standard Changesets model for independently versioned monorepos.

## ✅ Release Commands

| Command | Purpose |
|---|---|
| `pnpm changeset` | Create a release note for changed packages |
| `pnpm version-packages` | Apply pending changesets and update changelogs |
| `pnpm release:status` | Inspect pending changesets and release state |
| `pnpm release:check` | Verify publish metadata and package readiness |
| `pnpm release:pack` | Build tarballs for all public packages |
| `pnpm release` | Build and publish changed packages with Changesets |

## 🛠 Local Maintainer Fallback

If GitHub Actions is unavailable and you need to release manually:

1. `pnpm install`
2. `pnpm lint`
3. `pnpm typecheck`
4. `pnpm test`
5. `pnpm release:check`
6. `pnpm version-packages`
7. review the generated package version changes and `CHANGELOG.md` files
8. `pnpm release`

## 🔐 Required Secrets

The GitHub `Release` workflow expects:

- `NPM_TOKEN`

`GITHUB_TOKEN` is provided automatically by GitHub Actions.

## 📦 Notes

- Do not edit package versions manually.
- Do not maintain a custom release manifest.
- Do not create manual monorepo-wide release tags.
- Internal workspaces such as `docs` and `packages/cli/src/serve-ui` must remain `private: true`.
