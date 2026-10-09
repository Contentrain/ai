import { describe, expect, it, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest'

vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 })
import { join } from 'node:path'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { readJson, writeJson } from '../../src/util/fs.js'
import { cloneTemplate, createClient, makeInitedTemplate, parseResult } from '../support/project.js'

/**
 * #510 at the tool layer: with `git.verify: true` a rejecting commit hook
 * fails the write and the agent sees the hook's output. #509: every local
 * write names the resolved base branch in its `git` block.
 */

let template: string
let testDir: string
let hooksDir: string
let client: Client

const MODEL = { id: 'notes', name: 'Notes', kind: 'collection', domain: 'blog', i18n: true, title_field: 'title', fields: { title: { type: 'string' } } }

async function setVerify(): Promise<void> {
  const path = join(testDir, '.contentrain', 'config.json')
  const config = await readJson<Record<string, unknown>>(path)
  await writeJson(path, { ...config, git: { verify: true } })
  client = await createClient(testDir)
}

beforeAll(async () => {
  template = await makeInitedTemplate({ locales: ['en'] })
})

afterAll(async () => {
  await rm(template, { recursive: true, force: true })
})

beforeEach(async () => {
  testDir = await cloneTemplate(template)
  hooksDir = await mkdtemp(join(tmpdir(), 'cr-tool-hooks-'))
  const hook = join(hooksDir, 'pre-commit')
  await writeFile(hook, '#!/bin/sh\necho "secret scanner: blocked a token in models/notes.json" >&2\nexit 1\n')
  await chmod(hook, 0o755)
  execFileSync('git', ['config', 'core.hooksPath', hooksDir], { cwd: testDir })
  client = await createClient(testDir)
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
  await rm(hooksDir, { recursive: true, force: true })
})

describe('commit hooks at the tool layer', () => {
  it('default: the hook is skipped, the write lands and names its base branch', async () => {
    const result = await client.callTool({ name: 'contentrain_model_save', arguments: MODEL })
    expect(result.isError).toBeFalsy()
    const git = parseResult(result)['git'] as Record<string, unknown>
    const base = execFileSync('git', ['branch', '--show-current'], { cwd: testDir, encoding: 'utf-8' }).trim()
    expect(git['base_branch']).toBe(base)
  })

  it('git.verify: true: a rejecting hook fails the write and its output reaches the agent', async () => {
    await setVerify()
    const result = await client.callTool({ name: 'contentrain_model_save', arguments: MODEL })
    expect(result.isError).toBe(true)
    const text = (result as { content: Array<{ text: string }> }).content[0]!.text
    expect(text).toContain('secret scanner: blocked a token in models/notes.json')
    const log = execFileSync('git', ['log', '--all', '--format=%s'], { cwd: testDir, encoding: 'utf-8' })
    expect(log).not.toContain('notes')
  })
})
