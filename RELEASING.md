# Releasing Contentrain

Contentrain uses lockstep versioning for all publishable packages:

- `@contentrain/mcp`
- `contentrain`
- `@contentrain/types`
- `@contentrain/rules`
- `@contentrain/skills`
- `@contentrain/query`

## 🧭 Source of Truth

The source of truth for release state is:

1. each package `package.json` version
2. the lockstep runtime version strings in:
   - `packages/cli/src/index.ts`
   - `packages/mcp/src/server.ts`
3. the repo release scripts in `scripts/`

## 🛠 Commands

Set the next lockstep version:

```bash
pnpm release:version 0.1.0
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

1. `pnpm release:version <version>`
2. `pnpm install`
3. `pnpm lint`
4. `pnpm typecheck`
5. `pnpm test`
6. `pnpm build`
7. `pnpm release:check`
8. `pnpm release:pack`
9. publish packages in dependency order:
   - `@contentrain/types`
   - `@contentrain/mcp`
   - `@contentrain/query`
   - `@contentrain/rules`
   - `@contentrain/skills`
   - `contentrain`

## 📝 Notes

- `workspace:*` dependencies are expected during development and are resolved by the package manager during publish.
- Do not publish with `0.0.0`.
- Do not mix package versions; this repo currently releases in lockstep.
