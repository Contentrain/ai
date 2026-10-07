import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { contentrainLoader, type ContentrainLoaderContext } from '../../src/astro/loader.js'
import { fileExists, limitRead, MAX_OPEN_READS, readDir, readJson, readText } from '../../src/generator/utils.js'

let root: string
beforeAll(() => { root = mkdtempSync(join(tmpdir(), 'cr-read-')) })
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('reading project files', () => {
  it('reads a missing file or directory as absent', async () => {
    writeFileSync(join(root, 'a-file'), 'x')
    expect(await readJson(join(root, 'nope.json'))).toBeNull()
    expect(await readText(join(root, 'nope.md'))).toBeNull()
    expect(await readDir(join(root, 'nope'))).toEqual([])
    expect(await fileExists(join(root, 'nope.json'))).toBe(false)
    // ENOTDIR: a path through a file.
    expect(await readJson(join(root, 'a-file', 'data.json'))).toBeNull()
    expect(await readDir(join(root, 'a-file'))).toEqual([])
  })

  it('keeps a file that is not valid JSON reading as null, as before', async () => {
    writeFileSync(join(root, 'broken.json'), '{ "title": ')
    expect(await readJson(join(root, 'broken.json'))).toBeNull()
    expect(await fileExists(join(root, 'broken.json'))).toBe(true)
  })

  it('throws any other read failure instead of reading it as absent', async () => {
    mkdirSync(join(root, 'a-dir.json'), { recursive: true })
    // EISDIR stands in for EMFILE, EACCES and EIO: a file that is there but cannot be read.
    await expect(readJson(join(root, 'a-dir.json'))).rejects.toMatchObject({ code: 'EISDIR' })
    await expect(readText(join(root, 'a-dir.json'))).rejects.toMatchObject({ code: 'EISDIR' })
  })

  it(`never has more than ${MAX_OPEN_READS} reads in flight`, async () => {
    let inFlight = 0
    let most = 0
    const read = () => limitRead(async () => {
      most = Math.max(most, ++inFlight)
      await new Promise(resolve => setTimeout(resolve, 1))
      inFlight--
      return inFlight
    })
    await Promise.all(Array.from({ length: 1000 }, read))
    expect(most).toBe(MAX_OPEN_READS)
    expect(inFlight).toBe(0)
  })

  it('frees its slot when a read fails', async () => {
    await Promise.allSettled(Array.from({ length: MAX_OPEN_READS * 2 }, () => limitRead(() => Promise.reject(new Error('x')))))
    await expect(limitRead(async () => 'ok')).resolves.toBe('ok')
  })
})

function project(name: string, models: Record<string, { kind: string, i18n: boolean, file: string, content: string }>): string {
  const dir = join(root, name)
  mkdirSync(join(dir, '.contentrain', 'models'), { recursive: true })
  writeFileSync(join(dir, '.contentrain', 'config.json'), JSON.stringify({ version: 1, locales: { default: 'en', supported: ['en'] }, domains: ['site'] }))
  for (const [id, model] of Object.entries(models)) {
    writeFileSync(join(dir, '.contentrain', 'models', `${id}.json`), JSON.stringify({ id, name: id, kind: model.kind, domain: 'site', i18n: model.i18n, title_field: 'title', fields: { title: { type: 'string' } } }))
    mkdirSync(join(dir, '.contentrain', 'content', 'site', id), { recursive: true })
    writeFileSync(join(dir, '.contentrain', 'content', 'site', id, model.file), model.content)
  }
  return dir
}

function context(extra: Partial<ContentrainLoaderContext> = {}) {
  const ids: string[] = []
  const warnings: string[] = []
  const ctx = {
    store: { clear: () => { ids.length = 0 }, set: (entry: { id: string }) => { ids.push(entry.id) } },
    logger: { info: () => {}, warn: (message: string) => { warnings.push(message) } },
    ...extra,
  }
  return { ctx, ids, warnings }
}

describe('contentrainLoader content-file guard', () => {
  it('warns with the model and both counts when a content file that is there loads no entries', async () => {
    const dir = project('broken', {
      posts: { kind: 'collection', i18n: true, file: 'en.json', content: '{ "a1": { "title": "One" }, ' },
      about: { kind: 'singleton', i18n: false, file: 'data.json', content: '{"title":"About"}' },
    })
    const posts = context()
    await contentrainLoader({ model: 'posts', root: dir }).load(posts.ctx)
    expect(posts.ids).toEqual([])
    expect(posts.warnings).toEqual([
      `contentrainLoader: model "posts": 1 content file found, 0 read — no entries from ${join('.contentrain', 'content', 'site', 'posts', 'en.json')} (not valid JSON).`,
    ])
    const about = context()
    await contentrainLoader({ model: 'about', root: dir }).load(about.ctx)
    expect(about.ids).toEqual(['about'])
    expect(about.warnings).toEqual([])
  })

  it('reads the project once for the loaders of one Astro sync, and again on the dev server', async () => {
    const dir = project('shared', {
      about: { kind: 'singleton', i18n: false, file: 'data.json', content: '{"title":"About"}' },
    })
    const config = { root: dir }
    await contentrainLoader({ model: 'about', root: dir }).load(context({ config }).ctx)
    // A model added after the first load is not in the sync's manifest: the loaders share one read.
    project('shared', { team: { kind: 'singleton', i18n: false, file: 'data.json', content: '{"title":"Team"}' } })
    await expect(contentrainLoader({ model: 'team', root: dir }).load(context({ config }).ctx)).rejects.toThrow('model "team" not found')
    // A new sync (a new config) reads it, and so does the dev server, which reloads on change.
    const next = context({ config: { root: dir } })
    await contentrainLoader({ model: 'team', root: dir }).load(next.ctx)
    expect(next.ids).toEqual(['team'])
    const dev = context({ config, watcher: { add: () => {}, on: () => {} } })
    await contentrainLoader({ model: 'team', root: dir }).load(dev.ctx)
    expect(dev.ids).toEqual(['team'])
  })
})
