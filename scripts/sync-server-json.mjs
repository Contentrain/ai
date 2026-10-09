#!/usr/bin/env node

/**
 * Keeps `packages/mcp/server.json` (the MCP Registry manifest) on the version
 * of `@contentrain/mcp` it describes. Changesets bumps `package.json` only, so
 * the manifest sat at 1.8.1 while npm was on 3.x (#516).
 *
 *   node scripts/sync-server-json.mjs          # write the version (run by `pnpm version-packages`)
 *   node scripts/sync-server-json.mjs --check  # exit 1 when it differs (run by `pnpm docs:check`)
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const PKG = join(ROOT, 'packages/mcp/package.json')
const MANIFEST = join(ROOT, 'packages/mcp/server.json')

const { name, version } = JSON.parse(readFileSync(PKG, 'utf8'))
const raw = readFileSync(MANIFEST, 'utf8')
const manifest = JSON.parse(raw)

const stale = []
if (manifest.version !== version) stale.push(`version ${manifest.version}`)
for (const pkg of manifest.packages ?? []) {
  if (pkg.identifier === name && pkg.version !== version) stale.push(`packages[${pkg.identifier}].version ${pkg.version}`)
}

if (process.argv.includes('--check')) {
  if (stale.length > 0) {
    console.error(`server-json: packages/mcp/server.json is stale (${stale.join(', ')}); ${name} is ${version}. Run \`node scripts/sync-server-json.mjs\`.`)
    process.exit(1)
  }
  console.log(`server-json: packages/mcp/server.json is on ${name}@${version}`)
} else if (stale.length > 0) {
  manifest.version = version
  for (const pkg of manifest.packages ?? []) if (pkg.identifier === name) pkg.version = version
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`server-json: packages/mcp/server.json → ${version}`)
}
