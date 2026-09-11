// Every package this repository publishes to npm.
//
// Two scripts read this list: `release-check.mjs` asserts each entry carries
// the metadata npm and the registry page need, and `release-pack.mjs` packs the
// tarballs. Changesets publishes from the workspace rather than from here, so a
// package missing from this list still ships — it just ships unchecked. That is
// exactly what happened to `emitter-astro` and `wp-import`, which were on npm
// for weeks without ever passing the pre-flight.
//
// Adding a publishable package means adding it here in the same change.
export const PUBLISHABLE_PACKAGES = [
  { name: '@contentrain/mcp', dir: 'packages/mcp', packageJson: 'packages/mcp/package.json' },
  { name: 'contentrain', dir: 'packages/cli', packageJson: 'packages/cli/package.json' },
  { name: '@contentrain/types', dir: 'packages/types', packageJson: 'packages/types/package.json' },
  { name: '@contentrain/rules', dir: 'packages/rules', packageJson: 'packages/rules/package.json' },
  { name: '@contentrain/skills', dir: 'packages/skills', packageJson: 'packages/skills/package.json' },
  { name: '@contentrain/query', dir: 'packages/sdk/js', packageJson: 'packages/sdk/js/package.json' },
  { name: '@contentrain/emitter-astro', dir: 'packages/emitter-astro', packageJson: 'packages/emitter-astro/package.json' },
  { name: '@contentrain/wp-import', dir: 'packages/wp-import', packageJson: 'packages/wp-import/package.json' },
  { name: '@contentrain/verify', dir: 'packages/verify', packageJson: 'packages/verify/package.json' },
]

export const PRIVATE_PACKAGE_JSONS = [
  'docs/package.json',
  'packages/cli/src/serve-ui/package.json',
]
