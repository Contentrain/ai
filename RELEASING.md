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

## 🔌 Claude Code Plugin

`plugins/contentrain` is not an npm package, but it is versioned by Changesets
like everything else. It joins the workspace as `@contentrain/claude-plugin`
(`private: true`), and `privatePackages` in `.changeset/config.json` is set to
`{ "version": true, "tag": false }` — versioned, but no git tag, because there
is no npm release to tag.

Why it is wired in at all: Claude Code pins installed users to the `version`
in `plugin.json` and only offers an update when that string changes. A skills
edit or an MCP-pin bump that forgets it reaches nobody, which is exactly what
happened when the plugin shipped `@contentrain/mcp@2.1.1` after 2.2.0 fixed a
data-loss bug.

The version lives in **one** place, `plugins/contentrain/package.json`, which
is the file Changesets bumps. `pnpm plugin:build` propagates it into
`plugins/contentrain/.claude-plugin/plugin.json` and the `metadata.version` of
`.claude-plugin/marketplace.json`. Never edit either manifest's version by
hand — CI regenerates the payload and fails on a dirty diff.

So a plugin-affecting change is an ordinary changeset:

```bash
pnpm changeset          # pick @contentrain/claude-plugin
pnpm plugin:build       # rebuild the payload if you touched skills
```

You do not run `plugin:build` for the version itself — `pnpm version-packages`
ends with it, so the release PR already carries the propagated manifests.
Run it locally only when you have changed what the plugin ships, which is the
same reason CI checks the payload on every PR.

The community marketplace advances its pinned commit SHA on its own; the
version bump is what actually delivers the change to existing installs.

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

None for npm. The `Release` workflow authenticates to the registry with **OIDC
trusted publishing** (`id-token: write`, and the npm upgrade step above it —
trusted publishing needs npm >= 11.5.1). There is no `NPM_TOKEN`, and adding one
back would quietly replace a keyless, per-repository trust relationship with a
long-lived credential.

`GITHUB_TOKEN` is provided automatically by GitHub Actions.

## 🆕 A Package's First Publish

**Trusted publishing cannot create a package.** The registry accepts an OIDC
publish only for a package that already exists and has a trusted publisher
pointing at this repository and workflow. A brand-new package has nowhere to
attach that to yet, so the first publish must be done once, by hand, with a
logged-in account.

This is not hypothetical: `@contentrain/verify@0.1.0` failed exactly this way on
2026-09-11. The workflow published the other eight packages and then died on the
ninth with

```
npm error 404 Not Found - PUT https://registry.npmjs.org/@contentrain%2fverify
```

The 404 is misleading — the registry answers a create it will not authorise with
"not found" rather than 401/403, so that it does not leak whether a package
exists. Read it as "you may not create this", not as "something is missing".

So, for a new package:

1. Merge the release PR as usual. The workflow bumps every version, writes the
   changelogs, publishes everything it can, and fails on the new one. That
   failure is expected and harmless **provided nothing depends on the new
   package** — check that first, because a partial publish of a package others
   depend on is a different and much worse problem (`workspace:*` resolves to an
   exact version; a dependent published against a version that never reached the
   registry is broken on install).
2. From `main`, at the release commit — not from the feature branch, whose
   version is the pre-bump one:
   ```bash
   npm login
   git checkout main && git pull
   cd packages/<new> && npm publish --access public
   ```
   Publishing the wrong version here is unrecoverable: npm burns a version
   number permanently, and unpublishing does not free it.
3. On npmjs.com, add the trusted publisher for the new package: repository
   `Contentrain/ai`, workflow `release.yml`. Every later release then goes
   through the workflow like the others.
4. Create the tag the workflow did not get to, on the release commit:
   ```bash
   git tag -a "@contentrain/<new>@<version>" <release-sha> -m "@contentrain/<new>@<version>"
   git push origin "refs/tags/@contentrain/<new>@<version>"
   ```

### The MCP Registry step does not catch up on its own

`Publish to MCP Registry` runs only when the same workflow run published
`@contentrain/mcp`. If a run publishes mcp and then fails on a later package,
the registry step is skipped and stays behind — and re-running does not fix it,
because `changeset publish` will not republish a version already on npm, so mcp
is absent from `publishedPackages` the second time. Either run `mcp-publisher`
by hand or accept that the registry catches up at the next mcp release.

## 📦 Notes

- Do not edit package versions manually.
- Do not maintain a custom release manifest.
- Do not create manual monorepo-wide release tags.
- Internal workspaces such as `docs` and `packages/cli/src/serve-ui` must remain `private: true`.

## 🔌 `@contentrain/mcp` Optional Peer Dependencies

`@contentrain/mcp` ships the remote providers as optional peers so
consumers only install what they use:

- `@octokit/rest` — required when using `GitHubProvider`.
- `@gitbeaker/rest` — required when using `GitLabProvider`.

Stdio + LocalProvider flows (the default) do not need either. When
the MCP server is invoked with a provider whose peer is missing,
the factory throws a helpful error pointing at the install command.
Release audits do not need to bundle these peers — npm's
`peerDependenciesMeta.optional: true` handles it.
