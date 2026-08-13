import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { beforeEach, describe, expect, it } from 'vitest'
import { createServer } from '../../src/server.js'
import { MemoryProvider } from '../../src/testing/memory-provider.js'

/**
 * End-to-end through the tool layer, with no git and no filesystem — the whole
 * point of MemoryProvider. These assert the contract an agent sees, including
 * the guardrails a plan-level test cannot reach (confirm, no-op, init check).
 */

const CONFIG = JSON.stringify({
  version: 1,
  stack: 'nuxt',
  workflow: 'auto-merge',
  locales: { default: 'en', supported: ['en', 'tr'] },
  domains: ['system'],
})

let provider: MemoryProvider
let client: Client

async function connect(p: MemoryProvider): Promise<Client> {
  const server = createServer({ provider: p })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const c = new Client({ name: 'test', version: '1.0.0' })
  await Promise.all([c.connect(clientTransport), server.connect(serverTransport)])
  return c
}

const parse = (result: unknown): Record<string, unknown> =>
  JSON.parse((result as { content: Array<{ text: string }> }).content[0]!.text) as Record<string, unknown>

const vocabularyOf = (p: MemoryProvider): { version: number; terms: Record<string, Record<string, string>> } =>
  JSON.parse(p.snapshot()['.contentrain/vocabulary.json']!) as { version: number; terms: Record<string, Record<string, string>> }

beforeEach(async () => {
  provider = new MemoryProvider({ files: { '.contentrain/config.json': CONFIG } })
  client = await connect(provider)
})

describe('contentrain_vocabulary_save', () => {
  it('commits terms through the normal branch flow', async () => {
    const result = await client.callTool({
      name: 'contentrain_vocabulary_save',
      arguments: { terms: { 'sign-in': { en: 'Sign in', tr: 'Giriş yap' } } },
    })

    const data = parse(result)
    expect(data['status']).toBe('committed')
    expect(data['added']).toEqual(['sign-in'])
    expect(data['total_terms']).toBe(1)
    expect(vocabularyOf(provider).terms['sign-in']).toEqual({ en: 'Sign in', tr: 'Giriş yap' })

    // it went through a cr/* branch like every other write
    expect(provider.commits[0]!.branch).toMatch(/^cr\/vocabulary\/save\//)
    expect(data['workflow_action']).toBe('auto-merged')
  })

  it('merges across calls', async () => {
    await client.callTool({
      name: 'contentrain_vocabulary_save',
      arguments: { terms: { 'sign-in': { en: 'Sign in' } } },
    })
    await client.callTool({
      name: 'contentrain_vocabulary_save',
      arguments: { terms: { 'log-out': { en: 'Log out' } } },
    })

    expect(Object.keys(vocabularyOf(provider).terms).toSorted()).toEqual(['log-out', 'sign-in'])
  })

  it('refuses a locale-first vocabulary and says what it wanted', async () => {
    const result = await client.callTool({
      name: 'contentrain_vocabulary_save',
      arguments: { terms: { en: { 'sign-in': 'Sign in' } } },
    })

    const data = parse(result)
    expect(data['error']).toContain('is not a locale code')
    expect(String(data['hint'])).toContain('Grouping by locale at the top level')
    expect(provider.commits).toHaveLength(0)
  })

  it('refuses before the project is initialized', async () => {
    const bare = new MemoryProvider()
    const c = await connect(bare)
    const data = parse(await c.callTool({
      name: 'contentrain_vocabulary_save',
      arguments: { terms: { 'sign-in': { en: 'Sign in' } } },
    }))
    expect(String(data['error'])).toContain('not initialized')
  })

  it('respects the provider refusing writes', async () => {
    provider.setWriteReadiness({ blocked: true, message: 'Too many active contentrain branches.' })
    const data = parse(await client.callTool({
      name: 'contentrain_vocabulary_save',
      arguments: { terms: { 'sign-in': { en: 'Sign in' } } },
    }))
    expect(data['action']).toBe('blocked')
    expect(provider.commits).toHaveLength(0)
  })
})

describe('contentrain_vocabulary_delete', () => {
  beforeEach(async () => {
    await client.callTool({
      name: 'contentrain_vocabulary_save',
      arguments: { terms: { 'sign-in': { en: 'Sign in' }, 'log-out': { en: 'Log out' } } },
    })
  })

  it('removes a term', async () => {
    const data = parse(await client.callTool({
      name: 'contentrain_vocabulary_delete',
      arguments: { terms: ['sign-in'], confirm: true },
    }))

    expect(data['status']).toBe('committed')
    expect(data['deleted']).toEqual(['sign-in'])
    expect(Object.keys(vocabularyOf(provider).terms)).toEqual(['log-out'])
  })

  it('requires confirm', async () => {
    const data = parse(await client.callTool({
      name: 'contentrain_vocabulary_delete',
      arguments: { terms: ['sign-in'], confirm: false },
    }))

    expect(String(data['error'])).toContain('confirm: true')
    expect(Object.keys(vocabularyOf(provider).terms).toSorted()).toEqual(['log-out', 'sign-in'])
  })

  // A delete that matches nothing should not leave a branch behind.
  it('is a no-op, not a commit, when nothing matched', async () => {
    const before = provider.commits.length
    const data = parse(await client.callTool({
      name: 'contentrain_vocabulary_delete',
      arguments: { terms: ['never-existed'], confirm: true },
    }))

    expect(data['status']).toBe('no-op')
    expect(data['missing']).toEqual(['never-existed'])
    expect(provider.commits).toHaveLength(before)
  })
})
