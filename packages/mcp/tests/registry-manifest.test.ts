import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * MCP Registry manifest sanity. The registry enforces limits at publish
 * time (release CI failed on 2026-07-13 with `expected length <= 100` for
 * `description`) — catch violations here instead of on main after merge.
 */

const PKG_ROOT = join(import.meta.dirname, '..')
const serverJson = JSON.parse(readFileSync(join(PKG_ROOT, 'server.json'), 'utf-8')) as {
  name: string
  title?: string
  description: string
  packages: Array<{ identifier: string, registryType: string }>
}
const packageJson = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf-8')) as {
  name: string
  mcpName?: string
}

describe('server.json (MCP Registry manifest)', () => {
  it('description fits the registry limit (≤ 100 chars)', () => {
    expect(serverJson.description.length).toBeLessThanOrEqual(100)
  })

  it('registry name matches package.json mcpName', () => {
    expect(serverJson.name).toBe(packageJson.mcpName)
  })

  it('npm package entry points at this package', () => {
    const npmEntry = serverJson.packages.find(p => p.registryType === 'npm')
    expect(npmEntry?.identifier).toBe(packageJson.name)
  })
})
