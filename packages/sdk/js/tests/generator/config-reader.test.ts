import { describe, it, expect } from 'vitest'
import { readProjectManifest } from '../../src/generator/config-reader.js'
import { join } from 'node:path'

const FIXTURE = join(import.meta.dirname, '../fixtures/basic-blog')

describe('config-reader', () => {
  it('reads config with correct defaults', async () => {
    const manifest = await readProjectManifest(FIXTURE)
    expect(manifest.config.version).toBe(1)
    expect(manifest.config.stack).toBe('nuxt')
    expect(manifest.config.locales.default).toBe('en')
    expect(manifest.config.locales.supported).toEqual(['en', 'tr'])
    expect(manifest.config.domains).toEqual(['blog', 'marketing', 'system'])
  })

  it('reads all models sorted by id', async () => {
    const manifest = await readProjectManifest(FIXTURE)
    expect(manifest.models).toHaveLength(4)
    expect(manifest.models.map(m => m.id)).toEqual(['blog-article', 'blog-post', 'error-messages', 'hero'])
  })

  it('maps correct content files for collection', async () => {
    const manifest = await readProjectManifest(FIXTURE)
    const blogFiles = manifest.contentFiles.filter(f => f.modelId === 'blog-post')
    expect(blogFiles).toHaveLength(2)
    expect(blogFiles.map(f => f.locale).toSorted()).toEqual(['en', 'tr'])
    expect(blogFiles[0]!.kind).toBe('collection')
  })

  it('maps correct content files for singleton', async () => {
    const manifest = await readProjectManifest(FIXTURE)
    const heroFiles = manifest.contentFiles.filter(f => f.modelId === 'hero')
    expect(heroFiles).toHaveLength(2)
    expect(heroFiles.map(f => f.locale).toSorted()).toEqual(['en', 'tr'])
    expect(heroFiles[0]!.kind).toBe('singleton')
  })

  it('maps correct content files for dictionary', async () => {
    const manifest = await readProjectManifest(FIXTURE)
    const errorFiles = manifest.contentFiles.filter(f => f.modelId === 'error-messages')
    expect(errorFiles).toHaveLength(2)
    expect(errorFiles[0]!.kind).toBe('dictionary')
  })

  it('maps correct content files for document with slug extraction', async () => {
    const manifest = await readProjectManifest(FIXTURE)
    const docFiles = manifest.contentFiles.filter(f => f.modelId === 'blog-article')
    expect(docFiles).toHaveLength(4) // 2 slugs × 2 locales
    expect(docFiles[0]!.kind).toBe('document')
    // Slug extracted from directory name, not frontmatter
    const slugs = [...new Set(docFiles.map(f => f.slug))].toSorted()
    expect(slugs).toEqual(['design-tips', 'welcome-post'])
    // Both locales present for each slug
    const enFiles = docFiles.filter(f => f.locale === 'en')
    expect(enFiles).toHaveLength(2)
    const trFiles = docFiles.filter(f => f.locale === 'tr')
    expect(trFiles).toHaveLength(2)
  })
})
