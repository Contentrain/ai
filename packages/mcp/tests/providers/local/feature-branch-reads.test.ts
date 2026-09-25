import { describe, expect, it, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'

// Real git against a bare remote; contends with the other git suites.
vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 })
import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { CONTENTRAIN_BRANCH } from '@contentrain/types'
import { createGit } from '../../../src/git/identity.js'
import { withReadScope } from '../../../src/providers/local/content-view.js'
import { LocalProvider } from '../../../src/providers/local/index.js'
import { addBareRemote } from '../../fixtures/bare-remote.js'
import { cloneTemplate, createClient, makeInitedTemplate, parseResult } from '../../support/project.js'

/**
 * #229 — on a checked-out feature branch, which content writes leave alone
 * (#227), `.contentrain/` is read from the `contentrain` ref; everything else,
 * and everything on the base branch, still comes from the working tree.
 *
 * The perf criterion (a fixed number of spawns per read tool) is asserted in
 * feature-branch-read-spawns.test.ts, which wraps the git binary.
 */
const ENTRIES = 5
let template: string
let work: string
let remote: string
let baseBranch: string
let client: Client

beforeAll(async () => {
  template = await makeInitedTemplate({ locales: ['en', 'tr'] })
  const setup = await createClient(template)
  await setup.callTool({
    name: 'contentrain_model_save',
    arguments: {
      id: 'faq', name: 'FAQ', kind: 'collection', domain: 'test', i18n: true, title_field: 'question',
      fields: { question: { type: 'string', required: true } },
    },
  })
  await setup.callTool({
    name: 'contentrain_model_save',
    arguments: { id: 'ui-strings', name: 'UI Strings', kind: 'dictionary', domain: 'test', i18n: true, title_field: 'key' },
  })
  await setup.callTool({
    name: 'contentrain_content_save',
    arguments: {
      model: 'faq',
      entries: ['en', 'tr'].flatMap(locale => Array.from({ length: ENTRIES }, (_, i) => ({
        locale, id: `f${String(i).padStart(11, '0')}`, data: { question: `Q${i} ${locale}?` },
      }))),
    },
  })
  await setup.callTool({
    name: 'contentrain_content_save',
    arguments: { model: 'ui-strings', entries: [{ locale: 'en', data: { 'hero.title': 'Seed' } }] },
  })
})

afterAll(async () => {
  await rm(template, { recursive: true, force: true })
})

beforeEach(async () => {
  work = await cloneTemplate(template)
  const git = createGit(work)
  baseBranch = (await git.raw(['branch', '--show-current'])).trim()
  remote = await addBareRemote(work)
  await git.push('origin', baseBranch)
  await git.push('origin', CONTENTRAIN_BRANCH)
  await git.raw(['symbolic-ref', 'refs/remotes/origin/HEAD', `refs/remotes/origin/${baseBranch}`])
  client = await createClient(work)
})

afterEach(async () => {
  await Promise.all([work, remote].map(dir => rm(dir, { recursive: true, force: true })))
})

const call = async (name: string, args: Record<string, unknown> = {}) =>
  parseResult(await client.callTool({ name, arguments: args }))
const saveTitle = (value: string) =>
  call('contentrain_content_save', { model: 'ui-strings', entries: [{ locale: 'en', data: { 'hero.title': value } }] })
const dictionary = (result: Record<string, unknown>) => result['data'] as Record<string, string>

describe('on a feature branch, read tools show contentrain (#229)', () => {
  let contentrainTip: string

  beforeEach(async () => {
    await createGit(work).raw(['checkout', '-b', 'feat/x'])
    expect((await saveTitle('Written'))['error']).toBeUndefined()
    contentrainTip = (await createGit(work).raw(['rev-parse', CONTENTRAIN_BRANCH])).trim()
  })

  const fromRef = () => ({ source: 'ref', ref: CONTENTRAIN_BRANCH, commit: contentrainTip, checked_out: 'feat/x' })

  it('content_list returns the written value and says it came from the contentrain ref', async () => {
    const list = await call('contentrain_content_list', { model: 'ui-strings', locale: 'en' })
    expect(dictionary(list)['hero.title']).toBe('Written')
    expect(list['content_source']).toEqual(fromRef())
    // The working tree is where the developer left it.
    const onDisk = JSON.parse(await readFile(join(work, '.contentrain/content/test/ui-strings/en.json'), 'utf-8')) as Record<string, string>
    expect(onDisk['hero.title']).toBe('Seed')
  })

  it('describe, status and validate read the same ref and say so', async () => {
    const created = await call('contentrain_content_save', {
      model: 'faq', entries: [{ locale: 'en', id: 'fnew00000001', data: { question: 'New?' } }],
    })
    expect(created['error']).toBeUndefined()
    contentrainTip = (await createGit(work).raw(['rev-parse', CONTENTRAIN_BRANCH])).trim()

    // ENTRIES × 2 locales on the tree; the new one exists only on contentrain.
    const described = await call('contentrain_describe', { model: 'faq' })
    expect((described['stats'] as { total_entries: number }).total_entries).toBe(2 * ENTRIES + 1)
    expect(described['content_source']).toEqual(fromRef())

    const strings = await call('contentrain_describe', { model: 'ui-strings' })
    const status = await call('contentrain_status')
    expect((status['context'] as { stats: { entries: number } }).stats.entries)
      .toBe(2 * ENTRIES + 1 + (strings['stats'] as { total_entries: number }).total_entries)
    expect(status['content_source']).toEqual(fromRef())

    const validated = await call('contentrain_validate')
    expect(validated['content_source']).toEqual(fromRef())
  })

  it('the feature branch\'s tree, index and ref are never modified', async () => {
    const git = createGit(work)
    const tip = (await git.raw(['rev-parse', 'feat/x'])).trim()
    await saveTitle('Again')
    await call('contentrain_content_list', { model: 'ui-strings', locale: 'en' })
    expect((await git.raw(['rev-parse', 'feat/x'])).trim()).toBe(tip)
    expect((await git.raw(['status', '--porcelain'])).trim()).toBe('')
  })

  it('reads outside .contentrain keep coming from the working tree', async () => {
    await writeFile(join(work, 'app.vue'), '<template>uncommitted</template>\n', 'utf-8')
    const provider = new LocalProvider(work)
    await withReadScope(async () => {
      expect(await provider.readFile('app.vue')).toBe('<template>uncommitted</template>\n')
      expect(await provider.listDirectory('.')).toContain('app.vue')
      expect(JSON.parse(await provider.readFile('.contentrain/content/test/ui-strings/en.json'))['hero.title']).toBe('Written')
    })
  })
})

describe('on the base branch, reads stay on the working tree (#229)', () => {
  it('content_list reads the working tree and reports no ref source', async () => {
    // An uncommitted edit on disk is what a working-tree read returns.
    const path = join(work, '.contentrain/content/test/ui-strings/en.json')
    const onDisk = JSON.parse(await readFile(path, 'utf-8')) as Record<string, string>
    await writeFile(path, `${JSON.stringify({ ...onDisk, 'hero.title': 'Local edit' }, null, 2)}\n`, 'utf-8')

    const list = await call('contentrain_content_list', { model: 'ui-strings', locale: 'en' })
    expect(dictionary(list)['hero.title']).toBe('Local edit')
    expect(list['content_source']).toBeUndefined()
  })
})

describe('a detached HEAD (a CI checkout) reads the working tree', () => {
  it('reports no ref source', async () => {
    await createGit(work).raw(['checkout', '--detach'])
    const list = await call('contentrain_content_list', { model: 'ui-strings', locale: 'en' })
    expect(list['content_source']).toBeUndefined()
  })
})
