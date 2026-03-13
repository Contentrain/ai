import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import type { ContentrainConfig, ModelDefinition } from '@contentrain/types'
import { writeContent } from '../../src/core/content-manager.js'
import { countEntries } from '../../src/core/model-manager.js'
import { contentrainDir } from '../../src/util/fs.js'

let testDir: string

const config: ContentrainConfig = {
  version: 1,
  stack: 'nuxt',
  workflow: 'review',
  locales: { default: 'en', supported: ['en', 'tr'] },
  domains: ['blog'],
}

async function prepareModelDirs(model: ModelDefinition): Promise<void> {
  const crDir = contentrainDir(testDir)
  await mkdir(join(crDir, 'content', model.domain, model.id), { recursive: true })
  await mkdir(join(crDir, 'meta', model.id), { recursive: true })
}

function createDocumentModel(localeStrategy: NonNullable<ModelDefinition['locale_strategy']>): ModelDefinition {
  return {
    id: `blog-post-${localeStrategy}`,
    name: `Blog Post ${localeStrategy}`,
    kind: 'document',
    domain: 'blog',
    i18n: true,
    locale_strategy: localeStrategy,
    fields: {
      title: { type: 'string', required: true },
      slug: { type: 'slug', required: true },
    },
  }
}

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'cr-model-manager-test-'))
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

describe('countEntries', () => {
  it.each(['suffix', 'directory', 'none'] as const)(
    'counts document entries correctly for locale_strategy:%s',
    async (localeStrategy) => {
      const model = createDocumentModel(localeStrategy)
      await prepareModelDirs(model)

      await writeContent(testDir, model, [
        {
          slug: 'hello-world',
          locale: 'en',
          data: { title: 'Hello World', slug: 'hello-world', body: '# Hello' },
        },
        {
          slug: 'hello-world',
          locale: 'tr',
          data: { title: 'Merhaba Dunya', slug: 'hello-world', body: '# Merhaba' },
        },
      ], config)

      const stats = await countEntries(testDir, model)

      expect(stats.total).toBe(2)
      expect(stats.locales).toEqual({ en: 1, tr: 1 })
    },
  )
})
