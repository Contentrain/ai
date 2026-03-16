export const PUBLISHABLE_PACKAGES = [
  {
    name: '@contentrain/mcp',
    dir: 'packages/mcp',
    packageJson: 'packages/mcp/package.json',
    version: '1.0.0',
    runtimeVersionFiles: ['packages/mcp/src/server.ts'],
  },
  {
    name: 'contentrain',
    dir: 'packages/cli',
    packageJson: 'packages/cli/package.json',
    version: '0.1.0',
    runtimeVersionFiles: ['packages/cli/src/index.ts'],
  },
  {
    name: '@contentrain/types',
    dir: 'packages/types',
    packageJson: 'packages/types/package.json',
    version: '0.1.0',
  },
  {
    name: '@contentrain/rules',
    dir: 'packages/rules',
    packageJson: 'packages/rules/package.json',
    version: '0.1.0',
  },
  {
    name: '@contentrain/skills',
    dir: 'packages/skills',
    packageJson: 'packages/skills/package.json',
    version: '0.1.0',
  },
  {
    name: '@contentrain/query',
    dir: 'packages/sdk/js',
    packageJson: 'packages/sdk/js/package.json',
    version: '5.0.0',
  },
]

export const PRIVATE_PACKAGE_JSONS = [
  'docs/package.json',
  'packages/cli/src/serve-ui/package.json',
]
