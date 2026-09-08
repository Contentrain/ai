import { describe, it, expect, vi } from 'vitest'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { contentrainLoader } from '../../src/astro/loader.js'
import type { ContentrainLoaderContext } from '../../src/astro/loader.js'

const FIXTURE = join(import.meta.dirname, '../fixtures/basic-blog')

interface Stored {
  id: string
  data: Record<string, unknown>
  body?: string
  digest?: string
  rendered?: { html: string }
  filePath?: string
}

function context(extra: Partial<ContentrainLoaderContext> = {}) {
  const entries: Stored[] = []
  let cleared = 0
  const ctx: ContentrainLoaderContext & { entries: Stored[], cleared: () => number } = {
    store: {
      clear: () => { cleared++; entries.length = 0 },
      set: (entry) => { entries.push(entry as Stored) },
    },
    logger: { info: () => {}, warn: () => {} },
    generateDigest: (data: unknown) => `d:${JSON.stringify(data).length}`,
    entries,
    cleared: () => cleared,
    ...extra,
  }
  return ctx
}

describe('contentrainLoader', () => {
  it('loads a collection, one entry per record, sorted by id', async () => {
    const ctx = context()
    await contentrainLoader({ model: 'blog-post', root: FIXTURE, locale: 'en' }).load(ctx)
    expect(ctx.entries.length).toBeGreaterThan(0)
    expect(ctx.entries.map(e => e.id)).toEqual(ctx.entries.map(e => e.id).toSorted())
    const first = ctx.entries[0]!
    expect(first.data.id).toBe(first.id)
    expect(first.data.locale).toBe('en')
    expect(first.filePath).toBeUndefined()
    expect(first.digest).toMatch(/^d:\d+$/)
  })

  it('sends file paths relative to the Astro root, and none when there is no relative form', async () => {
    // Astro refuses an absolute filePath ("must be relative to the site root"),
    // and a .contentrain outside the Astro root has no relative form it takes.
    const inside = context({ config: { root: FIXTURE } })
    await contentrainLoader({ model: 'blog-post', root: FIXTURE, locale: 'en' }).load(inside)
    expect(inside.entries[0]!.filePath).toBe(join('.contentrain', 'content', 'blog', 'blog-post', 'en.json'))

    const asUrl = context({ config: { root: pathToFileURL(FIXTURE) } })
    await contentrainLoader({ model: 'blog-post', root: FIXTURE, locale: 'en' }).load(asUrl)
    expect(asUrl.entries[0]!.filePath).toBe(inside.entries[0]!.filePath)

    const outside = context({ config: { root: join(FIXTURE, 'src') } })
    await contentrainLoader({ model: 'blog-post', root: FIXTURE, locale: 'en' }).load(outside)
    expect(outside.entries[0]!.filePath).toBeUndefined()
  })

  it('prefixes ids by locale when a collection holds every language', async () => {
    // Astro ids are unique per collection: the same post in two languages would
    // silently overwrite one another without the prefix.
    const ctx = context()
    await contentrainLoader({ model: 'blog-post', root: FIXTURE }).load(ctx)
    const ids = ctx.entries.map(e => e.id)
    expect(ids.some(id => id.startsWith('en/'))).toBe(true)
    expect(ids.some(id => id.startsWith('tr/'))).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives a document its markdown body and renders it when Astro can', async () => {
    const renderMarkdown = vi.fn(async (content: string) => ({ html: `<p>${content.slice(0, 5)}</p>` }))
    const ctx = context({ renderMarkdown })
    await contentrainLoader({ model: 'blog-article', root: FIXTURE, locale: 'en' }).load(ctx)
    const entry = ctx.entries.find(e => e.id === 'welcome-post')!
    expect(entry).toBeDefined()
    expect(entry.data.slug).toBe('welcome-post')
    expect(entry.data.title).toBeTypeOf('string')
    expect(entry.body).toBeTypeOf('string')
    expect(entry.body).not.toContain('---')
    expect(entry.rendered?.html).toBe(`<p>${entry.body!.slice(0, 5)}</p>`)
    expect(renderMarkdown).toHaveBeenCalled()
  })

  it('turns a dictionary into one entry per key, not one blob', async () => {
    // A key is a semantic address; a single blob entry would make getEntry()
    // and reference() useless on the model that most needs them.
    const ctx = context()
    await contentrainLoader({ model: 'error-messages', root: FIXTURE, locale: 'en' }).load(ctx)
    expect(ctx.entries.length).toBeGreaterThan(1)
    for (const entry of ctx.entries) {
      expect(entry.data.key).toBe(entry.id)
      expect(entry.data.value).toBeTypeOf('string')
    }
  })

  it('loads a singleton as one entry named after the model', async () => {
    const ctx = context()
    await contentrainLoader({ model: 'hero', root: FIXTURE, locale: 'en' }).load(ctx)
    expect(ctx.entries).toHaveLength(1)
    expect(ctx.entries[0]!.id).toBe('hero')
    expect(ctx.entries[0]!.data.locale).toBe('en')
  })

  it('keeps a non-i18n model free of locale noise', async () => {
    const ctx = context()
    await contentrainLoader({ model: 'author', root: FIXTURE }).load(ctx)
    expect(ctx.entries.length).toBeGreaterThan(0)
    for (const entry of ctx.entries) {
      expect(entry.id).not.toContain('/')
      expect(entry.data).not.toHaveProperty('locale')
    }
  })

  it('clears the store before filling it, so a removed entry disappears', async () => {
    const ctx = context()
    const loader = contentrainLoader({ model: 'blog-post', root: FIXTURE, locale: 'en' })
    await loader.load(ctx)
    const afterFirst = ctx.entries.length
    await loader.load(ctx)
    expect(ctx.cleared()).toBe(2)
    expect(ctx.entries).toHaveLength(afterFirst)
  })

  it('runs entries through parseData when Astro supplies a schema', async () => {
    const parseData = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...data, parsed: true }))
    const ctx = context({ parseData })
    await contentrainLoader({ model: 'hero', root: FIXTURE, locale: 'en' }).load(ctx)
    expect(ctx.entries[0]!.data.parsed).toBe(true)
    expect(parseData).toHaveBeenCalledTimes(1)
  })

  it('names the models it does know when the model id is wrong', async () => {
    const ctx = context()
    await expect(contentrainLoader({ model: 'nope', root: FIXTURE }).load(ctx)).rejects.toThrow(
      /model "nope" not found.*blog-post/s,
    )
  })

  it('warns instead of failing when an i18n model has no content for the locale', async () => {
    const warn = vi.fn()
    const ctx = context({ logger: { info: () => {}, warn } })
    await contentrainLoader({ model: 'blog-post', root: FIXTURE, locale: 'de' }).load(ctx)
    expect(ctx.entries).toHaveLength(0)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('locale "de"'))
  })

  it('watches the files behind the collection, registering listeners once', async () => {
    const add = vi.fn()
    const handlers: Record<string, ((path: string) => void)[]> = {}
    const on = vi.fn((event: string, cb: (path: string) => void) => {
      ;(handlers[event] ??= []).push(cb)
    })
    const ctx = context({ watcher: { add, on } })
    const loader = contentrainLoader({ model: 'blog-post', root: FIXTURE, locale: 'en' })
    await loader.load(ctx)
    await loader.load(ctx)
    expect(add).toHaveBeenCalledWith(expect.stringContaining(join('blog-post', 'en.json')))
    expect(add).toHaveBeenCalledWith(expect.stringContaining(join('models', 'blog-post.json')))
    // A listener per load would multiply the reload work on every save.
    expect(handlers.change).toHaveLength(1)
  })
})
