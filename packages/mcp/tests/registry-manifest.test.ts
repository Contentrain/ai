import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer } from '../src/server.js'

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
   * The count is what `npx @contentrain/mcp` lists, not the registry size:
   * the 5 media tools need a media-capable provider (Studio), so "27" told
   * every npm user about tools they would never see. Counted from a live local
   * server's tools/list, so the number follows the capability gate too.
   */
  it('the tool count in the description matches what a local server lists', async () => {
    const stated = /(\d+) deterministic MCP tools/.exec(serverJson.description)
    expect(stated, 'description should state the tool count').not.toBeNull()

    const server = createServer(tmpdir())
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const client = new Client({ name: 'manifest-test', version: '1.0.0' })
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)])
    const { tools } = await client.listTools()
    await client.close()

    expect(Number(stated![1])).toBe(tools.length)
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
