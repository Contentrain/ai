import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ProjectIR } from '@contentrain/types'
import { CHROME_BODY_SLOT, DICTIONARY_TITLE_FIELD, MIGRATION_CONTRACT_VERSION, componentSlot } from '@contentrain/types'
import { EMBED_TS, UI_STRING_DEFAULTS, UI_STRINGS_DIR, UI_STRINGS_MODEL, emitAstroProject } from './index'
import { uiStringsDir, uiStringsSource } from './ui-strings'

// A migrated site's comments and forms speak the site's language only if their
// text is content. These tests hold the three places that text meets — the
// emitter's key list, the browser runtime, the build-time reader — to one list.

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const TMP = '.vitest-tmp-ui-strings'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let embed: Record<string, any>

beforeAll(async () => {
  await mkdir(join(ROOT, TMP), { recursive: true })
  await writeFile(join(ROOT, TMP, 'embed.ts'), EMBED_TS, 'utf8')
  embed = await import(/* @vite-ignore */ join(ROOT, TMP, 'embed.ts'))
})

afterAll(async () => {
  await rm(join(ROOT, TMP), { recursive: true, force: true })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('one key list', () => {
  it('every key the browser runtime reads is a dictionary key with the same English default', () => {
    const mapped = new Map<string, string>(embed.STRING_KEYS)
    for (const [key, name] of mapped) {
      expect(UI_STRING_DEFAULTS[key as keyof typeof UI_STRING_DEFAULTS], key).toBe(embed.strings[name])
    }
    // …and every runtime string is reachable from the dictionary.
    expect([...mapped.values()].toSorted()).toEqual(Object.keys(embed.strings).toSorted())
  })

  it('the only dictionary keys the runtime does not read are the ones the component renders itself', () => {
    const mapped = new Set(embed.STRING_KEYS.map(([key]: [string]) => key))
    expect(Object.keys(UI_STRING_DEFAULTS).filter((k) => !mapped.has(k)).toSorted()).toEqual(['comments.noscript', 'form.noscript'])
  })

  it('the model is a per-language dictionary in the site domain', () => {
    expect(UI_STRINGS_MODEL).toMatchObject({ id: 'ui-strings', kind: 'dictionary', domain: 'site', i18n: true, title_field: DICTIONARY_TITLE_FIELD })
    expect(UI_STRINGS_DIR).toBe('.contentrain/content/site/ui-strings')
    // dictionary keys are flat strings — no field definitions
    expect(UI_STRINGS_MODEL.fields).toBeUndefined()
  })
})

const host = (strings?: string) => ({ dataset: strings === undefined ? {} : { strings } }) as never

describe('the browser runtime', () => {

  it('takes the page text from the host, key by key, over the defaults', () => {
    const before = { ...embed.strings }
    embed.applyStrings(host(JSON.stringify({ 'form.send': 'Gönder', 'comments.title': 'Yorumlar', 'comments.empty': '', 'common.loading': 7 })))
    expect(embed.strings.send).toBe('Gönder')
    expect(embed.strings.commentsTitle).toBe('Yorumlar')
    // an empty or non-string value keeps the default
    expect(embed.strings.noComments).toBe(before.noComments)
    expect(embed.strings.loading).toBe(before.loading)
    Object.assign(embed.strings, before)
  })

  it('changes nothing for text it cannot read', () => {
    const before = { ...embed.strings }
    embed.applyStrings(host('{ not json'))
    embed.applyStrings(host())
    embed.applyStrings(host('null'))
    expect(embed.strings).toEqual(before)
  })
})

describe('the build-time reader', () => {
  const dir = `${TMP}/store/ui-strings`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let reader: Record<string, any>

  beforeAll(async () => {
    await mkdir(join(ROOT, dir), { recursive: true })
    await writeFile(join(ROOT, dir, 'tr.json'), JSON.stringify({ 'form.send': 'Gönder', 'comments.title': 'Yorumlar' }), 'utf8')
    await writeFile(join(ROOT, TMP, 'ui-strings.ts'), uiStringsSource(dir), 'utf8')
    reader = await import(/* @vite-ignore */ join(ROOT, TMP, 'ui-strings.ts'))
  })

  it('reads the language’s dictionary over the defaults, and names what is missing once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const tr = reader.uiStrings('tr')
    expect(tr['form.send']).toBe('Gönder')
    expect(tr['comments.title']).toBe('Yorumlar')
    expect(tr['form.sending']).toBe(UI_STRING_DEFAULTS['form.sending'])
    expect(Object.keys(tr).toSorted()).toEqual(Object.keys(UI_STRING_DEFAULTS).toSorted())
    reader.uiStrings('tr-TR')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]![0]).toContain('tr.json has no text for')
    expect(warn.mock.calls[0]![0]).not.toContain('form.send,')
  })

  it('without a dictionary: English text, and the build log says so for a non-English page', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(reader.uiStrings('de')).toEqual(UI_STRING_DEFAULTS)
    expect(warn.mock.calls.map((c) => c[0])).toEqual([
      `[contentrain] ui-strings: no dictionary for "de" at ${dir}/de.json — comments and forms show English text`,
    ])
    warn.mockClear()
    // English needs no dictionary to be right
    expect(reader.uiStrings('en')).toEqual(UI_STRING_DEFAULTS)
    expect(reader.uiStrings(undefined)).toEqual(UI_STRING_DEFAULTS)
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('emitted project', () => {
  const ir: ProjectIR = {
    version: MIGRATION_CONTRACT_VERSION,
    site: { url: 'https://example.com', locales: ['tr'] },
    routes: [{ id: 'r', pattern: '/:slug', kind: 'single', family: 'f' }],
    families: [{
      id: 'f',
      kind: 'single',
      chrome: [{ id: 'body', position: 'body', html: `<main>${CHROME_BODY_SLOT}${componentSlot('c-comments')}${componentSlot('c-form')}</main>` }],
      components: [{ component: 'c-comments' }, { component: 'c-form' }],
      css: { strategy: 'localcss' },
    }],
    components: [
      { id: 'c-comments', type: 'comments', source: 'runtime' },
      { id: 'c-form', type: 'form', source: 'runtime', model: 'contact' },
    ],
    css_default: 'purge_set',
  }
  const input = {
    ir,
    content: { posts: [{ slug: 'merhaba', title: 'Merhaba', body: '<p>x</p>', entry: { model_id: 'posts', entry_id: 'e1', locale: 'tr' } }] },
    runtime: { base_url: 'https://studio.test', project_id: 'p' },
  }

  it('components read the page language’s text and hand it to the runtime', () => {
    const { files } = emitAstroProject(input)
    expect(files['src/lib/ui-strings.ts']).toContain(`import.meta.glob<Record<string, unknown>>("/${UI_STRINGS_DIR}/*.json"`)
    for (const [file, noscript] of [['CComments', 'comments.noscript'], ['CForm', 'form.noscript']] as const) {
      const source = files[`src/components/${file}.astro`]!
      expect(source).toContain(`import { uiStrings } from '../lib/ui-strings'`)
      expect(source).toContain('const text = uiStrings(lang)')
      expect(source).toContain('data-strings={JSON.stringify(text)}')
      expect(source).toContain(`{text['${noscript}']}`)
      expect(source).not.toContain('need JavaScript.')
    }
    expect(files['src/layouts/F.astro']).toContain('lang={htmlAttrs.lang}')
  })

  it('warns at emit when a page language has no declared dictionary', () => {
    expect(emitAstroProject(input).warnings).toContain(
      `ui-strings: no dictionary declared in options.uiStrings.locales for tr — comments and forms on those pages show English text unless ${UI_STRINGS_DIR}/{locale}.json exists at build`,
    )
    const declared = emitAstroProject({ ...input, options: { uiStrings: { locales: ['tr'] } } })
    expect(declared.warnings.some((w) => w.startsWith('ui-strings:'))).toBe(false)
  })

  it('an English site, or one without runtime components, needs no warning and no reader', () => {
    const en = emitAstroProject({ ...input, ir: { ...ir, site: { ...ir.site, locales: ['en'] } } })
    expect(en.warnings.some((w) => w.startsWith('ui-strings:'))).toBe(false)
    const bare = emitAstroProject({ ...input, runtime: undefined })
    expect(bare.files['src/lib/ui-strings.ts']).toBeUndefined()
    expect(bare.warnings.some((w) => w.startsWith('ui-strings:'))).toBe(false)
  })

  it('takes a different store directory, and refuses one that leaves the project', () => {
    const moved = emitAstroProject({ ...input, options: { uiStrings: { dir: '/content/strings/', locales: ['tr'] } } })
    expect(moved.files['src/lib/ui-strings.ts']).toContain('import.meta.glob<Record<string, unknown>>("/content/strings/*.json"')
    for (const bad of ['../outside', 'a/../../b', 'a b', 'x/*', '']) expect(uiStringsDir(bad), bad).toBeUndefined()
    const escaped = emitAstroProject({ ...input, options: { uiStrings: { dir: '../outside', locales: ['tr'] } } })
    expect(escaped.files['src/lib/ui-strings.ts']).toContain(`"/${UI_STRINGS_DIR}/*.json"`)
    expect(escaped.warnings).toContain(`options.uiStrings.dir "../outside" is not a project-relative directory — using ${UI_STRINGS_DIR}`)
  })
})
