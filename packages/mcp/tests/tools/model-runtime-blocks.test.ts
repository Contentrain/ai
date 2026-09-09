import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { beforeEach, describe, expect, it } from 'vitest'
import type { ModelDefinition } from '@contentrain/types'
import { createServer } from '../../src/server.js'
import { MemoryProvider } from '../../src/testing/memory-provider.js'

/**
 * A model carries the runtime provider's blocks — `form` (which fields a
 * public contact form exposes, honeypot, captcha) and `comments`. Studio
 * writes them through its model PATCH; the content engine carries them
 * verbatim. `contentrain_model_save` rebuilt the definition from its own
 * input, so an agent adding one field silently turned the site's live form
 * off. The blocks must survive any structural edit, and `validate` must
 * accept a model file that carries them — the migration writes exactly that.
 *
 * MemoryProvider: no git, no filesystem; the subject is what the tool decides.
 */

const CONFIG = JSON.stringify({
  version: 1,
  stack: 'astro',
  workflow: 'auto-merge',
  locales: { default: 'en', supported: ['en'] },
  domains: ['site'],
})

// No `captcha: null` here: canonical serialization drops null values, so a
// provider must read an absent key as "off" — Studio does (`captcha === 'turnstile'`).
const FORM = { enabled: true, public: true, exposedFields: ['name', 'email', 'message'], honeypot: true, successMessage: 'Thanks!' }
const COMMENTS = { enabled: false }

// What @contentrain/wp-import + the migration write for a contact form.
const MODEL: ModelDefinition = {
  id: 'contact',
  name: 'Contact',
  kind: 'collection',
  domain: 'site',
  i18n: false,
  title_field: 'name',
  fields: {
    name: { type: 'string', required: true, label: 'Name', order: 1 },
    email: { type: 'email', required: true, label: 'Email', order: 2 },
    message: { type: 'text', label: 'Message', order: 3 },
    topic: { type: 'select', options: ['sales', 'support'], order: 4 },
    submitted_at: { type: 'datetime', order: 5 },
  },
  form: FORM,
  comments: COMMENTS,
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
  JSON.parse(provider.snapshot()['.contentrain/models/contact.json']!) as ModelDefinition

beforeEach(async () => {
  provider = new MemoryProvider({
    files: {
      '.contentrain/config.json': CONFIG,
      '.contentrain/models/contact.json': JSON.stringify(MODEL),
      '.contentrain/content/site/contact/data.json': '{}\n',
      '.contentrain/meta/contact/en.json': '{}\n',
    },
  })
  client = await connect(provider)
})

describe('model definitions carrying runtime blocks (form, comments)', () => {
  it('contentrain_validate accepts a model file that carries them', async () => {
    const data = parse(await client.callTool({ name: 'contentrain_validate', arguments: {} }))
    expect(data['valid']).toBe(true)
    expect((data['summary'] as { models_checked: number }).models_checked).toBe(1)
    expect(data['issues']).toEqual([])
  })

  it('contentrain_model_save keeps the blocks when the agent edits the structure', async () => {
    const { form: _form, comments: _comments, ...structure } = MODEL
    const data = parse(await client.callTool({
      name: 'contentrain_model_save',
      arguments: { ...structure, fields: { ...MODEL.fields, phone: { type: 'phone', label: 'Phone', order: 6 } } },
    }))
    expect(data['status']).toBe('committed')
    expect(data['action']).toBe('updated')
    expect(data['preserved_blocks']).toEqual(['form', 'comments'])

    const saved = savedModel()
    expect(Object.keys(saved.fields!)).toContain('phone')
    expect(saved.form).toEqual(FORM)
    expect(saved.comments).toEqual(COMMENTS)
    // canonical order: the engine's keys first, the provider's blocks after
    const keys = Object.keys(saved)
    expect(keys.indexOf('fields')).toBeLessThan(keys.indexOf('form'))
  })

  it('a new model has nothing to preserve and says nothing about it', async () => {
    const data = parse(await client.callTool({
      name: 'contentrain_model_save',
      arguments: { id: 'faq', name: 'FAQ', kind: 'collection', domain: 'site', i18n: false, title_field: 'question', fields: { question: { type: 'string', required: true } } },
    }))
    expect(data['action']).toBe('created')
    expect(data['preserved_blocks']).toBeUndefined()
    expect(JSON.parse(provider.snapshot()['.contentrain/models/faq.json']!)).not.toHaveProperty('form')
  })
})
