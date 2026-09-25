import { describe, expect, it, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'

// Real git against a bare remote; contends with the other git suites.
vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 })
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { CONTENTRAIN_BRANCH } from '@contentrain/types'
import { canonicalStringify } from '../../../src/core/serialization/index.js'
import { createGit } from '../../../src/git/identity.js'
import { addBareRemote } from '../../fixtures/bare-remote.js'
import { cloneTemplate, createClient, makeInitedTemplate, parseResult } from '../../support/project.js'

/**
 * #226 — a local write must change only what it writes, relative to the
 * `contentrain` tip it is committed on. The developer's working tree is a
 * plan input, not the truth: when another writer (Studio, a teammate, CI)
 * reached `contentrain` and the developer has not pulled, the old flow wrote
 * the whole file as the planner built it from the stale tree, deleting the
 * other writer's entry — while validation passed and the result listed only
 * the saved id.
 */

let template: string
let seedId: string
let contentPath: string
let work: string
let remote: string
let other: string
let baseBranch: string
let client: Client

beforeAll(async () => {
  template = await makeInitedTemplate({ locales: ['en'] })
  const setup = await createClient(template)
  await setup.callTool({
    name: 'contentrain_model_save',
    arguments: {
      id: 'faq', name: 'FAQ', kind: 'collection', domain: 'test', i18n: true, title_field: 'question',
      fields: { question: { type: 'string', required: true }, answer: { type: 'text' } },
    },
  })
  const saved = parseResult(await setup.callTool({
    name: 'contentrain_content_save',
    arguments: { model: 'faq', entries: [{ locale: 'en', data: { question: 'Seed?', answer: 'Seed.' } }] },
  }))
  seedId = (saved['results'] as Array<{ id: string }>)[0]!.id
  contentPath = '.contentrain/content/test/faq/en.json'
})

afterAll(async () => {
  await rm(template, { recursive: true, force: true })
})

beforeEach(async () => {
  // `work` is the developer's clone; `other` is a second writer that pushes
  // straight to the remote contentrain branch.
  work = await cloneTemplate(template)
  const git = createGit(work)
  baseBranch = (await git.raw(['branch', '--show-current'])).trim()
  remote = await addBareRemote(work)
  await git.push('origin', baseBranch)
  await git.push('origin', CONTENTRAIN_BRANCH)

  other = await mkdtemp(join(tmpdir(), 'cr-other-writer-'))
  await createGit(tmpdir()).clone(remote, other, ['--branch', CONTENTRAIN_BRANCH])
  const otherGit = createGit(other)
  await otherGit.addConfig('user.name', 'Other')
  await otherGit.addConfig('user.email', 'other@test.com')

  client = await createClient(work)
})

afterEach(async () => {
  await Promise.all([work, remote, other].map(dir => rm(dir, { recursive: true, force: true })))
})

const metaPath = '.contentrain/meta/faq/en.json'

/**
 * Rewrite the content file on the other clone's contentrain and push it.
 * Every entry the mutation touches is re-stamped in meta, the way Studio and
 * MCP writes stamp it — a probe that skips the stamp misses the conflict
 * every real concurrent write carries.
 */
async function otherWriterPushes(mutate: (entries: Record<string, Record<string, unknown>>) => void): Promise<void> {
  const file = join(other, contentPath)
  const entries = JSON.parse(await readFile(file, 'utf-8')) as Record<string, Record<string, unknown>>
  const before = canonicalStringify(entries)
  mutate(entries)
  await writeFile(file, canonicalStringify(entries), 'utf-8')
  const metaFile = join(other, metaPath)
  const meta = JSON.parse(await readFile(metaFile, 'utf-8')) as Record<string, Record<string, unknown>>
  const previous = JSON.parse(before) as Record<string, unknown>
  for (const id of Object.keys(entries)) {
    if (canonicalStringify(previous[id] ?? null) === canonicalStringify(entries[id])) continue
    meta[id] = { status: 'draft', ...meta[id], source: 'human', updated_by: 'editor@studio', updated_at: '2030-01-01T00:00:00.000Z' }
  }
  await writeFile(metaFile, canonicalStringify(meta), 'utf-8')
  const git = createGit(other)
  await git.add('.')
  await git.commit('content: faq (other writer)', { '--no-verify': null })
  await git.push('origin', CONTENTRAIN_BRANCH)
}

async function remoteEntries(ref: string): Promise<Record<string, Record<string, unknown>>> {
  return JSON.parse(await createGit(remote).show([`${ref}:${contentPath}`])) as Record<string, Record<string, unknown>>
}

describe('local content_save with a working tree behind contentrain (#226)', () => {
  it('keeps the entry another writer pushed, on contentrain and on the base branch', async () => {
    await otherWriterPushes((entries) => {
      entries['aaaa00000001'] = { question: 'From Studio?', answer: 'Yes.' }
    })

    const result = parseResult(await client.callTool({
      name: 'contentrain_content_save',
      arguments: { model: 'faq', entries: [{ locale: 'en', data: { question: 'From MCP?', answer: 'Also.' } }] },
    }))

    expect(result['error']).toBeUndefined()
    const mcpId = (result['results'] as Array<{ id: string }>)[0]!.id
    const onContentrain = await remoteEntries(CONTENTRAIN_BRANCH)
    expect(Object.keys(onContentrain).toSorted()).toEqual([seedId, 'aaaa00000001', mcpId].toSorted())
    expect(onContentrain['aaaa00000001']).toEqual({ question: 'From Studio?', answer: 'Yes.' })
    expect(onContentrain[mcpId]).toEqual({ question: 'From MCP?', answer: 'Also.' })
    // The advance carries the merged file to the base branch too.
    expect(Object.keys(await remoteEntries(baseBranch))).toContain('aaaa00000001')
  })

  it('merges an edit to a different field of the same entry', async () => {
    await otherWriterPushes((entries) => {
      entries[seedId]!['answer'] = 'Edited in Studio.'
    })

    const result = parseResult(await client.callTool({
      name: 'contentrain_content_save',
      arguments: { model: 'faq', entries: [{ locale: 'en', id: seedId, data: { question: 'Seed, renamed?', answer: 'Seed.' } }] },
    }))

    expect(result['error']).toBeUndefined()
    expect((await remoteEntries(CONTENTRAIN_BRANCH))[seedId]).toEqual({ question: 'Seed, renamed?', answer: 'Edited in Studio.' })
    // Both sides stamped the entry; this write's stamp wins as a unit.
    const meta = JSON.parse(await createGit(remote).show([`${CONTENTRAIN_BRANCH}:${metaPath}`])) as Record<string, Record<string, unknown>>
    expect(meta[seedId]).toMatchObject({ source: 'agent', updated_by: 'contentrain-mcp' })
    expect(meta[seedId]!['updated_at']).not.toBe('2030-01-01T00:00:00.000Z')
  })

  it('refuses, writing nothing, when both sides changed the same field', async () => {
    await otherWriterPushes((entries) => {
      entries[seedId]!['question'] = 'Studio wording?'
    })
    const remoteTipBefore = (await createGit(remote).raw(['rev-parse', CONTENTRAIN_BRANCH])).trim()
    const baseBefore = (await createGit(work).raw(['rev-parse', baseBranch])).trim()

    const result = parseResult(await client.callTool({
      name: 'contentrain_content_save',
      arguments: { model: 'faq', entries: [{ locale: 'en', id: seedId, data: { question: 'MCP wording?', answer: 'Seed.' } }] },
    }))

    expect(result['code']).toBe('CONTENT_WORKING_TREE_STALE')
    expect(String(result['error'])).toContain(contentPath)
    expect(result['developer_action']).toBe('git pull')
    expect((await createGit(remote).raw(['rev-parse', CONTENTRAIN_BRANCH])).trim()).toBe(remoteTipBefore)
    expect((await remoteEntries(CONTENTRAIN_BRANCH))[seedId]!['question']).toBe('Studio wording?')
    // No stray feature branch left behind, and no local ref carries this write:
    // the base did not move, and the local contentrain holds at most what it
    // fetched from the remote.
    const workGit = createGit(work)
    expect((await workGit.branchLocal()).all.filter(b => b.startsWith('cr/'))).toEqual([])
    expect((await workGit.raw(['rev-parse', baseBranch])).trim()).toBe(baseBefore)
    expect((await workGit.raw(['rev-parse', CONTENTRAIN_BRANCH])).trim()).toBe(remoteTipBefore)
  })

  it('does not commit uncommitted working-tree edits along with the save', async () => {
    // The developer hand-edited the content file and did not commit it.
    const file = join(work, contentPath)
    const local = JSON.parse(await readFile(file, 'utf-8')) as Record<string, Record<string, unknown>>
    local['ffff00000001'] = { question: 'Uncommitted draft?' }
    await writeFile(file, canonicalStringify(local), 'utf-8')

    const result = parseResult(await client.callTool({
      name: 'contentrain_content_save',
      arguments: { model: 'faq', entries: [{ locale: 'en', data: { question: 'Saved?' } }] },
    }))

    expect(result['error']).toBeUndefined()
    expect(Object.keys(await remoteEntries(CONTENTRAIN_BRANCH))).not.toContain('ffff00000001')
  })

  // #229: content writes do not update a checked-out feature branch's tree
  // (#227), so there the planner reads `.contentrain/` from the contentrain
  // ref instead — the tree's lag no longer shows up as a stale plan.
  describe('on a feature branch, which content writes do not sync', () => {
    beforeEach(async () => {
      await createGit(work).raw(['checkout', '-b', 'feat/x'])
    })

    const save = async (data: Record<string, string>) => parseResult(await client.callTool({
      name: 'contentrain_content_save',
      arguments: { model: 'faq', entries: [{ locale: 'en', id: seedId, data }] },
    }))

    it('edits the same field twice with no merge in between — the second save sees the first', async () => {
      expect((await save({ question: 'v1?', answer: 'Seed.' }))['error']).toBeUndefined()

      const second = await save({ question: 'v2?', answer: 'Seed.' })

      expect(second['error']).toBeUndefined()
      expect((await remoteEntries(CONTENTRAIN_BRANCH))[seedId]).toEqual({ question: 'v2?', answer: 'Seed.' })
    })

    it('a second save that restates the first save\'s value keeps it', async () => {
      expect((await save({ question: 'v1?', answer: 'Seed.' }))['error']).toBeUndefined()
      expect((await save({ question: 'v1?', answer: 'Second.' }))['error']).toBeUndefined()

      expect((await remoteEntries(CONTENTRAIN_BRANCH))[seedId]).toEqual({ question: 'v1?', answer: 'Second.' })
    })

    it('another writer between the read and the write is still refused — with no git action to take', async () => {
      // The other writer reaches the remote first: the plan is made from this
      // clone's contentrain snapshot, the transaction fetches the newer tip,
      // and the same field differs.
      await otherWriterPushes((entries) => {
        entries[seedId] = { ...entries[seedId]!, question: 'Theirs?' }
      })

      const result = await save({ question: 'Mine?', answer: 'Seed.' })

      expect(result['code']).toBe('CONTENT_WORKING_TREE_STALE')
      expect(result['developer_action']).toBeUndefined()
      expect(String(result['agent_hint'])).toContain('Re-read the content and retry')
    })
  })
})
