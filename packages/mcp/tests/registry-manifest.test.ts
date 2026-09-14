import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TOOL_NAMES } from '../src/tools/annotations.js'

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
  /**
   * The description is the line an agent client shows when it discovers this
   * server, and it carried "24 deterministic MCP tools" while the registry held
   * 27. Published, externally visible, and read by the exact audience the count
   * is meant to inform — the worst place for this drift to live, and the one
   * place no docs check looks, because it is JSON rather than prose.
   *
   * Counted from this package's own `TOOL_NAMES` rather than `@contentrain/rules`:
   * the registry entry describes what THIS server registers, and a test should
   * not make the package depend on another one to say so.
   */
  it('the tool count in the description matches the registry', () => {
    const stated = /(\d+) deterministic MCP tools/.exec(serverJson.description)
    expect(stated, 'description should state the tool count').not.toBeNull()
    expect(Number(stated![1])).toBe(TOOL_NAMES.length)
  })

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
