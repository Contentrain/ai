import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { validateProject } from '../../../src/core/validator/index.js'
import { writeJson, contentrainDir } from '../../../src/util/fs.js'

/**
 * #116 — `contentrain validate` reported 0 errors on a project whose models
 * were un-editable through MCP, because only `model_save` checked field names.
 * The two validators now agree: `model_save` keeps a legacy name, and
 * `validate` says the model carries one — so the agent learns about it before
 * it edits the model, not when a write fails mid-operation.
 */

let testDir: string

const CONFIG = {
  version: 1,
  stack: 'nuxt',
  workflow: 'review',
  locales: { default: 'en', supported: ['en'] },
  domains: ['marketing'],
}

async function seed(model: Record<string, unknown>): Promise<void> {
  const cr = contentrainDir(testDir)
  await writeJson(join(cr, 'config.json'), CONFIG)
  await writeJson(join(cr, 'models', `${String(model['id'])}.json`), model)
  await writeJson(join(cr, 'content', 'marketing', String(model['id']), 'data.json'), {})
}

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'cr-legacy-field-names-'))
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

describe('validateProject — legacy field names', () => {
  it('notices every field that predates the snake_case rule, without failing the project', async () => {
    await seed({
      id: 'service-pages',
      name: 'Service Pages',
      kind: 'collection',
      domain: 'marketing',
      i18n: false,
      title_field: 'title',
      fields: {
        title: { type: 'string', required: true },
        metaTitle: { type: 'string' },
        heroDescription: { type: 'text' },
        seo: { type: 'object', fields: { ogImage: { type: 'image' } } },
      },
    })

    const result = await validateProject(testDir, {})

    const legacy = result.issues.filter(i => i.message.includes('predates the snake_case rule'))
    expect(legacy.map(i => i.field).toSorted()).toEqual(['heroDescription', 'metaTitle', 'seo.ogImage'])
    for (const issue of legacy) {
      expect(issue.severity).toBe('notice')
      expect(issue.model).toBe('service-pages')
      expect(issue.message).toContain('contentrain_model_save keeps it as-is')
    }
    expect(result.valid).toBe(true)
    expect(result.summary.errors).toBe(0)
    // Informational: a rename is a migration to plan, not a defect to clear.
    expect(result.summary.warnings).toBe(0)
  })

  it('says nothing about a model whose names are all snake_case', async () => {
    await seed({
      id: 'testimonials',
      name: 'Testimonials',
      kind: 'collection',
      domain: 'marketing',
      i18n: false,
      title_field: 'name',
      fields: { name: { type: 'string', required: true }, creative_work: { type: 'relation', model: 'workitems' } },
    })

    const result = await validateProject(testDir, {})

    expect(result.issues.filter(i => i.message.includes('snake_case'))).toEqual([])
  })
})
