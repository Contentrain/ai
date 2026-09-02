import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { beforeEach, describe, expect, it } from 'vitest'
import type { ModelDefinition } from '@contentrain/types'
import { createServer } from '../../src/server.js'
import { MemoryProvider } from '../../src/testing/memory-provider.js'

/**
 * #116 — a model authored before the snake_case rule carries `creativeWork`.
 * Enforcing the rule on every field of every save made such a model read-only
 * through MCP: even a one-line `title_field` correction was refused, and the
 * only way out was renaming the field, its content keys in every locale, and
 * every consuming component. Existing names are grandfathered; new ones are not.
 *
 * Through the tool layer on MemoryProvider — no git, no filesystem — because
 * the fix is in how `model_save` reads the existing model before validating.
 */

const CONFIG = JSON.stringify({
  version: 1,
  stack: 'nuxt',
  workflow: 'auto-merge',
  locales: { default: 'en', supported: ['en', 'tr'] },
  domains: ['marketing'],
})

const LEGACY_MODEL: ModelDefinition = {
  id: 'testimonials',
  name: 'Testimonials',
  kind: 'collection',
  domain: 'marketing',
  i18n: true,
  // `validate --fix` picked `title` — the job title ("CEO, Popile"). The person's
  // name is in `name`. Correcting that is the one-line edit that was impossible.
  title_field: 'title',
  fields: {
    name: { type: 'string', required: true },
    title: { type: 'string' },
    creativeWork: { type: 'relation', model: 'workitems' },
  },
}

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

const savedModel = (): ModelDefinition =>
  JSON.parse(provider.snapshot()['.contentrain/models/testimonials.json']!) as ModelDefinition

beforeEach(async () => {
  provider = new MemoryProvider({
    files: {
      '.contentrain/config.json': CONFIG,
      '.contentrain/models/testimonials.json': JSON.stringify(LEGACY_MODEL),
    },
  })
  client = await connect(provider)
})

describe('contentrain_model_save on a model with legacy field names', () => {
  it('saves a title_field correction without demanding a rename first', async () => {
    const result = await client.callTool({
      name: 'contentrain_model_save',
      arguments: { ...LEGACY_MODEL, title_field: 'name' },
    })

    const data = parse(result)
    expect(data['status']).toBe('committed')
    expect(data['action']).toBe('updated')

    const saved = savedModel()
    expect(saved.title_field).toBe('name')
    expect(Object.keys(saved.fields!)).toContain('creativeWork')

    // Tolerated, not silent: the response names what was kept.
    const warnings = data['schema_warnings'] as string[]
    expect(warnings.some(w => w.includes('"creativeWork"') && w.includes('legacy name'))).toBe(true)
  })

  it('still refuses a camelCase field that is new to that model', async () => {
    const result = await client.callTool({
      name: 'contentrain_model_save',
      arguments: { ...LEGACY_MODEL, fields: { ...LEGACY_MODEL.fields, heroImage: { type: 'image' } } },
    })

    const data = parse(result)
    expect(data['error']).toBe('Validation failed')
    expect(data['details']).toEqual(['Field "heroImage": invalid name — must be snake_case starting with letter'])
    expect(Object.keys(savedModel().fields!)).not.toContain('heroImage')
  })

  it('refuses a camelCase field on a brand-new model', async () => {
    const result = await client.callTool({
      name: 'contentrain_model_save',
      arguments: { ...LEGACY_MODEL, id: 'service-pages', name: 'Service Pages' },
    })

    const data = parse(result)
    expect(data['error']).toBe('Validation failed')
    expect(data['details']).toContain('Field "creativeWork": invalid name — must be snake_case starting with letter')
  })
})
