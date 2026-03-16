export const PUBLISHABLE_PACKAGES = [
  { name: '@contentrain/mcp', dir: 'packages/mcp', packageJson: 'packages/mcp/package.json' },
  { name: 'contentrain', dir: 'packages/cli', packageJson: 'packages/cli/package.json' },
  { name: '@contentrain/types', dir: 'packages/types', packageJson: 'packages/types/package.json' },
  { name: '@contentrain/rules', dir: 'packages/rules', packageJson: 'packages/rules/package.json' },
  { name: '@contentrain/skills', dir: 'packages/skills', packageJson: 'packages/skills/package.json' },
  { name: '@contentrain/query', dir: 'packages/sdk/js', packageJson: 'packages/sdk/js/package.json' },
]

export const PRIVATE_PACKAGE_JSONS = [
  'docs/package.json',
  'packages/cli/src/serve-ui/package.json',
]
