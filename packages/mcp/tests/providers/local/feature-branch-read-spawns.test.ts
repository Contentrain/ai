import { describe, expect, it, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'

// Real git; contends with the other git suites.
vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 })
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { createGit } from '../../../src/git/identity.js'
import { cloneTemplate, createClient, makeInitedTemplate, parseResult } from '../../support/project.js'

/**
 * #229 perf criterion — reading `.contentrain/` from the contentrain ref costs
 * a fixed handful of git spawns per tool call, however many files it reads:
 * no `git show` per file.
 *
 * Every git spawn in this file goes through a logging wrapper. `gitBinary()`
 * resolves the binary once per process, so the override is set before the
 * first git call; it slows every spawn, which is why this lives apart from
 * feature-branch-reads.test.ts. The object ids a `cat-file --batch` is asked for
 * go to a second log, so a test can tell which blobs the batch loaded.
 */
const spawnDir = await mkdtemp(join(tmpdir(), 'cr-git-spawns-'))
const spawnLog = join(spawnDir, 'spawns.log')
const batchLog = join(spawnDir, 'batch.log')
const realGit = execFileSync('/bin/sh', ['-c', 'command -v git'], { encoding: 'utf-8' }).trim()
await writeFile(join(spawnDir, 'git'), [
  '#!/bin/sh',
  `printf '%s\\n' "$1" >> '${spawnLog}'`,
  `if [ "$1" = cat-file ] && [ "$2" = --batch ]; then tee -a '${batchLog}' | '${realGit}' "$@"; exit $?; fi`,
  `exec '${realGit}' "$@"`,
  '',
].join('\n'))
await chmod(join(spawnDir, 'git'), 0o755)
const savedBinary = process.env['CONTENTRAIN_GIT_BINARY']
process.env['CONTENTRAIN_GIT_BINARY'] = join(spawnDir, 'git')

async function spawnsDuring(fn: () => Promise<unknown>): Promise<string[]> {
  await writeFile(spawnLog, '')
  await writeFile(batchLog, '')
  await fn()
  return (await readFile(spawnLog, 'utf-8')).split('\n').filter(Boolean)
}

/** Enough content files that one spawn per file would show: 40 × 2 locales. */
const ENTRIES = 40
let template: string
let work: string
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
  const saved = parseResult(await setup.callTool({
    name: 'contentrain_content_save',
    arguments: {
      model: 'faq',
      entries: ['en', 'tr'].flatMap(locale => Array.from({ length: ENTRIES }, (_, i) => ({
        locale, id: `f${String(i).padStart(11, '0')}`, data: { question: `Q${i} ${locale}?` },
      }))),
    },
  }))
  expect(saved['error']).toBeUndefined()
})

afterAll(async () => {
  if (savedBinary === undefined) delete process.env['CONTENTRAIN_GIT_BINARY']
  else process.env['CONTENTRAIN_GIT_BINARY'] = savedBinary
  await Promise.all([template, spawnDir].map(dir => rm(dir, { recursive: true, force: true })))
})

beforeEach(async () => {
  work = await cloneTemplate(template)
  client = await createClient(work)
})

afterEach(async () => {
  await rm(work, { recursive: true, force: true })
})

const call = async (name: string, args: Record<string, unknown>) =>
  parseResult(await client.callTool({ name, arguments: args }))
const reads = (spawns: string[]) => spawns.filter(cmd => cmd === 'show' || cmd === 'ls-tree' || cmd === 'cat-file')

describe('read spawns (#229)', () => {
  it('on a feature branch: one tree listing and one blob batch, then none while contentrain stays put', async () => {
    await createGit(work).raw(['checkout', '-b', 'feat/x'])

    const first = await spawnsDuring(async () => {
      const described = await call('contentrain_describe', { model: 'faq', include_sample: true })
      expect((described['stats'] as { total_entries: number }).total_entries).toBe(2 * ENTRIES)
    })
    expect(reads(first).toSorted()).toEqual(['cat-file', 'ls-tree'])
    expect(first.length).toBeLessThanOrEqual(4)

    const again = await spawnsDuring(() => call('contentrain_content_list', { model: 'faq', locale: 'tr' }))
    expect(reads(again)).toEqual([])
    expect(again.length).toBeLessThanOrEqual(2)
  })

  it('media stays out of the batch: a 2 MB image on contentrain is never read by describe or content_list', async () => {
    const git = createGit(work)
    // Put the image on the contentrain tip, as a media upload would.
    const side = await mkdtemp(join(tmpdir(), 'cr-assets-'))
    await git.raw(['worktree', 'add', side, 'contentrain'])
    await mkdir(join(side, '.contentrain/assets'), { recursive: true })
    await writeFile(join(side, '.contentrain/assets/hero.png'), Buffer.alloc(2 * 1024 * 1024, 0xAB))
    const sideGit = createGit(side)
    await sideGit.add('.')
    await sideGit.commit('hero image', { '--no-verify': null })
    const image = (await sideGit.raw(['rev-parse', 'HEAD:.contentrain/assets/hero.png'])).trim()
    await git.raw(['worktree', 'remove', '--force', side])
    await git.raw(['checkout', '-b', 'feat/x'])

    const spawns = await spawnsDuring(async () => {
      await call('contentrain_describe', { model: 'faq' })
      await call('contentrain_content_list', { model: 'faq', locale: 'en' })
    })
    expect(reads(spawns).toSorted()).toEqual(['cat-file', 'ls-tree'])
    const batched = (await readFile(batchLog, 'utf-8')).split('\n').filter(Boolean)
    expect(batched.length).toBeGreaterThan(0)
    expect(batched).not.toContain(image)
  })

  it('on the base branch: no ref reads at all', async () => {
    const spawns = await spawnsDuring(() => call('contentrain_describe', { model: 'faq' }))
    expect(reads(spawns)).toEqual([])
  })
})
