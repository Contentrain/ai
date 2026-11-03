#!/usr/bin/env node

/**
 * Keeps `templates/astro-starter/.mcp.json` on the `contentrain` CLI version
 * it pins. The file is what the CLI's `writeMcpConfig` writes for Claude Code
 * (`packages/cli/src/utils/ide.ts`, held byte for byte by
 * `packages/cli/tests/utils/ide.test.ts`), so the launcher's shape lives there
 * and this script moves only the version. The starter is not a workspace
 * package, so changesets never touches it: `version-packages` runs this after
 * the CLI bump, and the release PR carries the new pin.
 *
 *   node scripts/sync-starter-mcp.mjs          # write the version (run by `pnpm version-packages`)
 *   node scripts/sync-starter-mcp.mjs --check  # exit 1 when it differs (run by `pnpm docs:check`)
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const PKG = join(ROOT, 'packages/cli/package.json')
const CONFIG = join(ROOT, 'templates/astro-starter/.mcp.json')

const { name, version } = JSON.parse(readFileSync(PKG, 'utf8'))
const raw = readFileSync(CONFIG, 'utf8')
const config = JSON.parse(raw)
const args = config.mcpServers?.contentrain?.args ?? []
const at = args.findIndex(arg => arg.startsWith(`${name}@`))

if (at === -1) {
  console.error(`starter-mcp: templates/astro-starter/.mcp.json runs no ${name}@<version>; it must be what the CLI's writeMcpConfig writes for Claude Code.`)
  process.exit(1)
}

const pinned = `${name}@${version}`
if (process.argv.includes('--check')) {
  if (args[at] !== pinned) {
    console.error(`starter-mcp: templates/astro-starter/.mcp.json runs ${args[at]}; ${name} is ${version}. Run \`node scripts/sync-starter-mcp.mjs\`.`)
    process.exit(1)
  }
  console.log(`starter-mcp: templates/astro-starter/.mcp.json is on ${pinned}`)
} else if (args[at] !== pinned) {
  args[at] = pinned
  writeFileSync(CONFIG, `${JSON.stringify(config, null, 2)}\n`)
  console.log(`starter-mcp: templates/astro-starter/.mcp.json → ${pinned}`)
}
