---
"contentrain": patch
"@contentrain/rules": patch
---

fix(cli): resolve rules/skills packages reliably across npm, pnpm, and workspace layouts

- Add `@contentrain/skills` as a CLI dependency so it installs transitively
- Replace broken try/catch-around-lambda with eager `createPackageResolver()` that tests availability upfront
- Three fallback resolution strategies: CLI bundle path, project root, direct node_modules
- Show actionable error messages instead of generic "packages not installed"

fix(rules): publish `shared/` directory to npm

- Add `shared` to `files` and `exports` in package.json — 11 rule files referenced by `prompts/` were missing from published package
