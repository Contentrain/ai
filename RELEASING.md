# Releasing Contentrain

Contentrain uses package-specific versioning for public packages:

- `@contentrain/mcp` → `1.0.0`
- `contentrain` → `0.1.0`
- `@contentrain/types` → `0.1.0`
- `@contentrain/rules` → `0.1.0`
- `@contentrain/skills` → `0.1.0`
- `@contentrain/query` → `5.0.0`

## 🧭 Source of Truth

The source of truth for release state is:

1. the per-package version map in `scripts/release-manifest.mjs`
2. each package `package.json` version
3. runtime version strings for packages that expose them:
   - `packages/cli/src/index.ts`
   - `packages/mcp/src/server.ts`
4. the repo release scripts in `scripts/`

## 🛠 Commands

| Command | Purpose |
|---|---|
| `pnpm release:bump` | Auto-detect changes, bump versions, create release commit |
| `pnpm release` | Tag + push to origin (triggers CI publish) |
| `pnpm release:version` | Sync manifest versions to package.json + runtime files |
| `pnpm release:check` | Verify release readiness (version drift, missing README, etc.) |
| `pnpm release:pack` | Build tarballs for every publishable package |

## 🤖 Automated Release (Recommended)

Two commands — no manual version editing:

```bash
# 1. Auto-detect changed packages, bump versions, commit
pnpm release:bump

# 2. Tag + push → CI publishes to npm
pnpm release
```

`release:bump` does everything automatically:
- Finds the last `v*` tag
- Detects which packages changed since that tag
- Reads commit prefixes: `feat(…)` → **minor**, `fix(…)` / others → **patch**
- Updates `release-manifest.mjs` and all `package.json` files
- Creates a release commit with the version summary

`release` then tags (from highest manifest version) and pushes to origin.

The `release.yml` workflow:
- Runs lint, typecheck, test, and release:check
- Publishes all 6 packages to npm in dependency order
- Creates a GitHub Release with auto-generated notes

**Required:** `NPM_TOKEN` secret in GitHub repository settings.

## 🚢 Manual Publish Sequence

If CI is unavailable or you need to publish manually:

1. update `scripts/release-manifest.mjs` with target versions
2. `pnpm release:version`
3. `pnpm install`
4. `pnpm lint`
5. `pnpm typecheck`
6. `pnpm test`
7. `pnpm build`
8. `pnpm release:check`
9. `pnpm release:pack`
10. publish packages in dependency order:
   - `@contentrain/types`
   - `@contentrain/query`
   - `@contentrain/rules`
   - `@contentrain/skills`
   - `@contentrain/mcp`
   - `contentrain`

## 🧩 Version Strategy

- `@contentrain/query` follows the existing npm line and must publish above the already-released `4.x` range.
- `@contentrain/mcp` follows the existing npm line and starts this monorepo release line at `1.0.0`.
- `contentrain`, `@contentrain/types`, `@contentrain/rules`, and `@contentrain/skills` start at `0.1.0`.
- Packages do not need to share the same version.

## 🏷 Tag Convention

- Format: `v{major}.{minor}.{patch}` (e.g., `v1.1.0`)
- Tags trigger the `release.yml` workflow
- Each tag represents a monorepo-wide release point
- Individual package versions are tracked in `release-manifest.mjs`

## 📦 Published Packages

All packages are live on npm:

| Package | npm | Version |
|---|---|---|
| `@contentrain/mcp` | [npm](https://www.npmjs.com/package/@contentrain/mcp) | `1.0.0` |
| `contentrain` | [npm](https://www.npmjs.com/package/contentrain) | `0.1.0` |
| `@contentrain/types` | [npm](https://www.npmjs.com/package/@contentrain/types) | `0.1.0` |
| `@contentrain/rules` | [npm](https://www.npmjs.com/package/@contentrain/rules) | `0.1.0` |
| `@contentrain/skills` | [npm](https://www.npmjs.com/package/@contentrain/skills) | `0.1.0` |
| `@contentrain/query` | [npm](https://www.npmjs.com/package/@contentrain/query) | `5.0.0` |

## 📝 Notes

- `workspace:*` dependencies are expected during development and are resolved by the package manager during publish.
- Do not publish with `0.0.0`.
- Internal workspaces such as `docs` and `packages/cli/src/serve-ui` must remain `private: true`.
- `NPM_TOKEN` GitHub secret is required for automated publishing.
