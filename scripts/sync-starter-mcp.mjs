#!/usr/bin/env node

/**
 * Keeps `templates/astro-starter/.mcp.json` on an exact `contentrain` CLI
 * version. The starter does not depend on the CLI, so an unpinned
 * `npx contentrain serve --stdio` fetched whatever `latest` was on every start
 * of every delivered site. The plugin pins its launcher the same way
 * (`scripts/build-plugin.mjs`). The starter is not a workspace package, so
 * changesets never bumps it: `version-packages` runs this after the CLI bump,
 * and the release PR carries the new pin.
 *
 *   node scripts/sync-starter-mcp.mjs          # write the pin (run by `pnpm version-packages`)
 *   node scripts/sync-starter-mcp.mjs --check  # exit 1 when it differs (run by `pnpm docs:check`)
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const PKG = join(ROOT, 'packages/cli/package.json')
const CONFIG = join(ROOT, 'templates/astro-starter/.mcp.json')

const { name, version } = JSON.parse(readFileSync(PKG, 'utf8'))
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  console.error(`starter-mcp: cannot read an exact version from packages/cli/package.json (got ${JSON.stringify(version)})`)
  process.exit(1)
}

const config = JSON.parse(readFileSync(CONFIG, 'utf8'))
const args = ['-y', `${name}@${version}`, 'serve', '--stdio']
const current = config.mcpServers?.contentrain
const stale = current?.command !== 'npx' || JSON.stringify(current?.args) !== JSON.stringify(args)

if (process.argv.includes('--check')) {
  if (stale) {
    console.error(`starter-mcp: templates/astro-starter/.mcp.json runs ${JSON.stringify([current?.command, ...(current?.args ?? [])].join(' '))}; expected "npx ${args.join(' ')}". Run \`node scripts/sync-starter-mcp.mjs\`.`)
    process.exit(1)
  }
  console.log(`starter-mcp: templates/astro-starter/.mcp.json is on ${name}@${version}`)
} else if (stale) {
  config.mcpServers = { ...config.mcpServers, contentrain: { ...current, command: 'npx', args } }
  writeFileSync(CONFIG, `${JSON.stringify(config, null, 2)}\n`)
  console.log(`starter-mcp: templates/astro-starter/.mcp.json → ${name}@${version}`)
}
