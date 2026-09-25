import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ModelDefinition } from '@contentrain/types'
import { describe, expect, it } from 'vitest'
import { seoContentFiles, siteTitleFile, titleTemplateOf, type FactsSeo } from '../src/generate/seo'

// Golden tt5's head titles: Yoast's " - " pattern, two hand-written titles.
const facts: FactsSeo = {
  site: { name: 'Golden Studio' },
  seo: {
    provider: 'yoast',
    entries: {
      11: { title: 'Designing for quiet interfaces | Golden Studio', description: 'How we design interfaces that stay out of the way.' },
      12: { title: 'Cutting page weight in half', description: 'The four changes that halved our page weight.' },
      13: { title: 'Golden Studio opens a second office - Golden Studio' },
      14: { title: 'Writing release notes people read - Golden Studio', robots: 'noindex, follow' },
      22: { title: 'Team - Golden Studio' },
    },
  },
  content: {
    entries: [
      { wpId: 11, type: 'post', title: 'Designing for quiet interfaces' },
      { wpId: 12, type: 'post', title: 'Why we cut our page weight in half' },
      { wpId: 13, type: 'post', title: 'Golden Studio opens a second office' },
      { wpId: 14, type: 'post', title: 'Writing release notes people read' },
      { wpId: 22, type: 'page', title: 'Team' },
    ],
  },
}

describe('titleTemplateOf', () => {
  it('takes the separator most pages use between their title and the site name', () => {
    expect(titleTemplateOf(facts)).toBe('{title} - {site}')
  })

  it('falls back to WordPress\'s own pattern without SEO facts', () => {
    expect(titleTemplateOf({ site: { name: 'x' } })).toBe('{title} – {site}')
  })
})

describe('seoContentFiles', () => {
  it('copies hand-written titles, descriptions and noindex into seo fields and leaves pattern titles to the template', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'writer-seo-'))
    const posts = {
      a: { title: 'Designing for quiet interfaces', wp_id: 11 },
      b: { title: 'Why we cut our page weight in half', wp_id: 12 },
      c: { title: 'Golden Studio opens a second office', wp_id: 13 },
      d: { title: 'Writing release notes people read', wp_id: 14 },
      e: { title: 'No source SEO', wp_id: 99 },
    }
    await mkdir(join(dir, '.contentrain/content/blog/posts'), { recursive: true })
    await writeFile(join(dir, '.contentrain/content/blog/posts/data.json'), JSON.stringify(posts))
    const models = [{ id: 'posts', name: 'Posts', kind: 'collection', domain: 'blog', i18n: false, title_field: 'title', fields: { title: { type: 'string' }, seo: { type: 'object' } } }] as ModelDefinition[]
    const { files, entries } = await seoContentFiles(dir, models, facts, '{title} - {site}')
    const out = JSON.parse(files['.contentrain/content/blog/posts/data.json']!) as Record<string, { seo?: Record<string, unknown> }>
    expect(entries).toBe(3)
    expect(out.a!.seo).toEqual({ title: 'Designing for quiet interfaces | Golden Studio', description: 'How we design interfaces that stay out of the way.' })
    expect(out.b!.seo).toEqual({ title: 'Cutting page weight in half', description: 'The four changes that halved our page weight.' })
    expect(out.c!.seo).toBeUndefined()
    expect(out.d!.seo).toEqual({ noindex: true })
    expect(out.e!.seo).toBeUndefined()
    await rm(dir, { recursive: true, force: true })
  })
})

describe('siteTitleFile', () => {
  const store = async (site: Record<string, unknown>) => {
    const dir = await mkdtemp(join(tmpdir(), 'writer-site-'))
    await mkdir(join(dir, '.contentrain/content/site/site'), { recursive: true })
    await writeFile(join(dir, '.contentrain/content/site/site/data.json'), JSON.stringify(site))
    return dir
  }

  it('replaces an importer\'s placeholder name with the source\'s', async () => {
    const dir = await store({ title: 'Site', tagline: 'Notes' })
    const file = await siteTitleFile(dir, facts)
    expect(file?.path).toBe('.contentrain/content/site/site/data.json')
    expect(JSON.parse(file!.text)).toEqual({ tagline: 'Notes', title: 'Golden Studio' })
    await rm(dir, { recursive: true, force: true })
  })

  it('keeps a name the store already has', async () => {
    const dir = await store({ title: 'Golden Studio Ltd' })
    expect(await siteTitleFile(dir, facts)).toBeUndefined()
    await rm(dir, { recursive: true, force: true })
  })
})
