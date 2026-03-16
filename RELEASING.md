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

Sync package manifests and runtime versions from `scripts/release-manifest.mjs`:

```bash
pnpm release:version
```

Verify release readiness:

```bash
pnpm release:check
```

Build tarballs for every publishable package:

```bash
pnpm release:pack
```

## 🚢 Recommended Publish Sequence

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

## 📝 Notes

- `workspace:*` dependencies are expected during development and are resolved by the package manager during publish.
- Do not publish with `0.0.0`.
- Internal workspaces such as `docs` and `packages/cli/src/serve-ui` must remain `private: true`.
