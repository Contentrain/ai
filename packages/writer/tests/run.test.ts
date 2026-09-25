import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { KitCatalog } from '@contentrain/astro-kit'
import type { ProjectPlan } from '@contentrain/types'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { qualifiedToolNames, writerTools, type ToolContext } from '../src/agent/tools'
import { jobOptions, runWriter, writerPermissions, type RunOptions } from '../src/agent/run'
import type { Shooter } from '../src/shoot'
import { localBudget } from '../src/budget'

let root: string
let ctx: ToolContext

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'writer-run-'))
  await mkdir(join(root, '.contentrain', 'content', 'blog', 'posts'), { recursive: true })
  await writeFile(join(root, '.contentrain', 'content', 'blog', 'posts', 'data.json'), '{}\n')
  ctx = {
    root,
    plan: { format: 'contentrain-project-plan@1' } as unknown as ProjectPlan,
    catalog: { format: 'astro-kit-catalog@1', tokens: [], dependencies: {}, components: [] } as KitCatalog,
    facts: { format: 'facts@1', site: { origin: 'https://example.com', name: 'x', lang: 'en' }, templates: [] },
    factsDir: root,
    shooter: {} as Shooter,
    written: new Set(),
  }
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

const call = async (name: string, args: Record<string, unknown>) => {
  const definition = writerTools(ctx).find(t => t.name === name)!
  return definition.handler(args as never, {}) as Promise<{ content: Array<{ type: string, text?: string }>, isError?: boolean }>
}

describe('file_write tool', () => {
  it('writes a view and records it', async () => {
    const result = await call('file_write', { path: 'src/views/Home.astro', content: '---\n---\n<p />\n' })
    expect(result.isError).toBeUndefined()
    expect([...ctx.written]).toContain('src/views/Home.astro')
  })

  it('refuses a content file, leaves it untouched and tells the model why', async () => {
    const result = await call('file_write', { path: '.contentrain/content/blog/posts/data.json', content: '{"x":{"title":"typed by a model"}}' })
    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toMatch(/not writable/)
    expect(await readdir(join(root, '.contentrain', 'content', 'blog', 'posts'))).toEqual(['data.json'])
    const { readFile } = await import('node:fs/promises')
    expect(await readFile(join(root, '.contentrain', 'content', 'blog', 'posts', 'data.json'), 'utf8')).toBe('{}\n')
  })

  it('refuses reading a content entry', async () => {
    const result = await call('file_read', { path: '.contentrain/content/blog/posts/data.json' })
    expect(result.isError).toBe(true)
  })
})

describe('permission gate', () => {
  it('allows writer tools and refuses everything else by name', async () => {
    const denied: string[] = []
    const gate = writerPermissions(qualifiedToolNames(), denied)
    const signal = new AbortController().signal
    expect((await gate('mcp__writer__file_write', {}, { signal } as never)).behavior).toBe('allow')
    for (const name of ['Write', 'Edit', 'Bash', 'WebFetch', 'mcp__other__write_file']) {
      expect((await gate(name, {}, { signal } as never)).behavior).toBe('deny')
    }
    expect(denied).toEqual(['Write', 'Edit', 'Bash', 'WebFetch', 'mcp__other__write_file'])
  })
})

describe('job options', () => {
  const base = (): RunOptions => ({ jobs: [], context: ctx, apiKey: 'test-key', budgetUsd: 10 })

  it('switches off built-in tools, filesystem settings and session persistence, and caps turns and dollars', () => {
    const options = jobOptions(base(), { id: 'a', prompt: 'p', role: 'write' }, 2.5, [])
    expect(options.tools).toEqual([])
    expect(options.settingSources).toEqual([])
    expect(options.persistSession).toBe(false)
    expect(options.allowedTools).toEqual(qualifiedToolNames())
    expect(options.maxBudgetUsd).toBe(2.5)
    expect(options.maxTurns).toBeGreaterThan(0)
    expect(Object.keys(options.mcpServers ?? {})).toEqual(['writer'])
  })

  it('uses the write model for drafts and the repair model for fix rounds', () => {
    expect(jobOptions(base(), { id: 'a', prompt: 'p', role: 'write' }, 1, []).model).toBe('claude-opus-5-5')
    expect(jobOptions(base(), { id: 'a', prompt: 'p', role: 'repair' }, 1, []).model).toBe('claude-sonnet-5')
  })

  it('shares one system prompt across jobs (one cache prefix)', () => {
    const a = jobOptions(base(), { id: 'a', prompt: 'first', role: 'write' }, 1, [])
    const b = jobOptions(base(), { id: 'b', prompt: 'second', role: 'repair' }, 1, [])
    expect(a.systemPrompt).toEqual(b.systemPrompt)
  })
})

const result = (cost: number) => ({
  type: 'result', subtype: 'success', num_turns: 3, total_cost_usd: cost, result: 'wrote src/views/Home.astro',
  modelUsage: { 'claude-opus-5-5': { inputTokens: 1000, outputTokens: 200, cacheReadInputTokens: 5000, cacheCreationInputTokens: 800, costUSD: cost } },
})

const turn = (id: string, output: number) => ({
  type: 'assistant',
  message: { id, model: 'claude-opus-5-5', usage: { input_tokens: 1000, output_tokens: output, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
})

describe('runWriter', () => {
  it('runs jobs, reports cost and tokens per job and in total', async () => {
    const seen: string[] = []
    const report = await runWriter({
      jobs: [{ id: 'hero', prompt: 'write Hero', role: 'write' }, { id: 'home', prompt: 'fix home', role: 'repair' }],
      context: ctx,
      apiKey: 'test-key',
      budgetUsd: 10,
      query: (({ prompt }: { prompt: string }) => (async function* () {
        seen.push(prompt)
        yield result(1.25)
      })()) as never,
    })
    expect(seen.toSorted()).toEqual(['fix home', 'write Hero'])
    expect(report.jobs.map(j => [j.id, j.outcome, j.costUsd])).toEqual([['hero', 'success', 1.25], ['home', 'success', 1.25]])
    expect(report.costUsd).toBe(2.5)
    expect(report.tokens).toEqual({ input: 2000, output: 400, cacheRead: 10000, cacheWrite: 1600 })
  })

  it('starts no job once the run budget is spent', async () => {
    const report = await runWriter({
      jobs: [{ id: 'a', prompt: 'a', role: 'write' }, { id: 'b', prompt: 'b', role: 'write' }],
      context: ctx,
      apiKey: 'test-key',
      budgetUsd: 1,
      concurrency: 1,
      query: (() => (async function* () { yield result(1) })()) as never,
    })
    expect(report.jobs.map(j => j.outcome)).toEqual(['success', 'skipped_budget'])
  })


  it('charges the budget on every turn and stops within one turn of the cap', async () => {
    const budget = localBudget(0.05, 60_000)
    const charges: number[] = []
    const charge = budget.charge
    budget.charge = (entry) => { charges.push(entry.usd); charge(entry) }
    let turns = 0
    const report = await runWriter({
      jobs: [{ id: 'a', prompt: 'a', role: 'write' }, { id: 'b', prompt: 'b', role: 'write' }],
      context: ctx,
      apiKey: 'test-key',
      budget,
      budgetUsd: 10,
      concurrency: 1,
      query: (() => (async function* () {
        // $0.004 input + $0.02 output = $0.024 a turn: the third turn crosses $0.05.
        for (let i = 0; i < 10; i++) { turns++; yield turn(`m${i}`, 1000) }
        yield result(0.24)
      })()) as never,
    })
    expect(turns).toBe(3)
    expect(charges).toEqual([0.024, 0.024, 0.024])
    expect(report.stopped).toBe('budget')
    expect(report.jobs.map(j => j.outcome)).toEqual(['stopped_budget', 'stopped_budget'])
  })

  it('charges a streamed message once, by its growth', async () => {
    const budget = localBudget(10, 60_000)
    const charges: number[] = []
    const charge = budget.charge
    budget.charge = (entry) => { charges.push(entry.usd); charge(entry) }
    await runWriter({
      jobs: [{ id: 'a', prompt: 'a', role: 'write' }],
      context: ctx,
      apiKey: 'test-key',
      budget,
      budgetUsd: 10,
      query: (() => (async function* () {
        yield turn('m1', 100)
        yield turn('m1', 1000)
        yield result(0.024)
      })()) as never,
    })
    // $0.006 for the first block, $0.018 more when the same message grows; the SDK total adds nothing.
    expect(charges).toEqual([0.006, 0.018])
  })

  it('stops on the signal and reports it as time', async () => {
    const controller = new AbortController()
    const report = await runWriter({
      jobs: [{ id: 'a', prompt: 'a', role: 'write' }, { id: 'b', prompt: 'b', role: 'write' }],
      context: ctx,
      apiKey: 'test-key',
      signal: controller.signal,
      budgetUsd: 10,
      concurrency: 1,
      query: ((({ options }: { options: { abortController: AbortController } }) => (async function* () {
        yield turn('m1', 10)
        controller.abort()
        if (options.abortController.signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' })
      })())) as never,
    })
    expect(report.stopped).toBe('time')
    expect(report.jobs.map(j => j.outcome)).toEqual(['stopped_time', 'stopped_time'])
  })
})
