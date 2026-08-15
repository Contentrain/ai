import { describe, expect, it, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest'

vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 })
import { join } from 'node:path'
import { rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { simpleGit } from 'simple-git'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { CONTENTRAIN_BRANCH } from '@contentrain/types'
import { createClient, parseResult, makeInitedTemplate, cloneTemplate } from '../support/project.js'

let template: string
let testDir: string
let client: Client

beforeAll(async () => {
  template = await makeInitedTemplate()
})

afterAll(async () => {
  await rm(template, { recursive: true, force: true })
})

beforeEach(async () => {
  testDir = await cloneTemplate(template)
  client = await createClient(testDir)
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

/** Diverge: contentrain gets a content commit, the base gets a code commit that conflicts nowhere. */
async function diverge(dir: string): Promise<void> {
  const git = simpleGit(dir)
  const wt = join(tmpdir(), `cr-tool-reconcile-${Date.now()}`)
  await git.raw(['worktree', 'add', wt, CONTENTRAIN_BRANCH])
  const wtGit = simpleGit(wt)
  await wtGit.addConfig('user.name', 'Editor')
  await wtGit.addConfig('user.email', 'editor@test.com')
  await writeFile(join(wt, '.contentrain', 'vocabulary.json'), JSON.stringify({ version: 1, terms: { brand: { en: 'Ours' } } }))
  await wtGit.add('.')
  await wtGit.commit('[contentrain] vocabulary')
  await git.raw(['worktree', 'remove', wt, '--force'])

  await writeFile(join(dir, 'divergent.md'), 'base-side work\n')
  await git.add('.')
  await git.commit('base-side commit')
}

describe('contentrain_reconcile (tool surface)', () => {
  it('reports in_sync on a fresh project', async () => {
    const result = parseResult(await client.callTool({ name: 'contentrain_reconcile', arguments: {} }))
    expect(result['status']).toBe('in_sync')
  })

  it('previews a divergence by default and executes with dry_run:false', async () => {
    await diverge(testDir)

    const preview = parseResult(await client.callTool({ name: 'contentrain_reconcile', arguments: {} }))
    expect(preview['status']).toBe('preview')
    expect(preview['conflicts']).toEqual([])
    expect((preview['next_steps'] as string[])[0]).toContain('dry_run:false')

    const applied = parseResult(await client.callTool({
      name: 'contentrain_reconcile',
      arguments: { dry_run: false },
    }))
    expect(applied['status']).toBe('reconciled')
    expect(applied['base_advance']).toBe('advanced')

    // Both histories joined; the base holds the vocabulary AND its own commit.
    const git = simpleGit(testDir)
    const branch = (await git.raw(['branch', '--show-current'])).trim()
    const vocab = await git.show([`${branch}:.contentrain/vocabulary.json`])
    expect(vocab).toContain('Ours')
    expect(await git.show([`${branch}:divergent.md`])).toContain('base-side work')
  })
})
