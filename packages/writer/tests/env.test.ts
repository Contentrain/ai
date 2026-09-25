import { describe, expect, it } from 'vitest'
import { jobOptions } from '../src/agent/run'
import type { ToolContext } from '../src/agent/tools'
import { localBudget, usdOf } from '../src/budget'
import { agentEnv, commandEnv } from '../src/env'
import { runCommand } from '../src/project'

const worker = { PATH: '/usr/bin:/bin', HOME: '/home/w', ANTHROPIC_API_KEY: 'sk-worker', DATABASE_URL: 'postgres://secret', GITHUB_TOKEN: 'ghp_secret', NPM_TOKEN: 'npm_secret' }

describe('commandEnv', () => {
  it('passes the basics and no credential of the worker', () => {
    const env = commandEnv(worker)
    expect(env.PATH).toBe('/usr/bin:/bin')
    expect(env.HOME).toBe('/home/w')
    expect(env.CI).toBe('true')
    expect(Object.values(env).join(' ')).not.toMatch(/secret|sk-worker/)
    expect(Object.keys(env)).not.toContain('ANTHROPIC_API_KEY')
  })

  it('keeps the key out of the processes the tools start', async () => {
    const saved = process.env.ANTHROPIC_API_KEY
    process.env.ANTHROPIC_API_KEY = 'sk-must-not-leak'
    try {
      const result = await runCommand(process.cwd(), process.execPath, ['-e', 'console.log(JSON.stringify(process.env))'])
      expect(result.ok).toBe(true)
      expect(result.output).not.toContain('sk-must-not-leak')
      expect(result.output).not.toContain('ANTHROPIC_API_KEY')
    } finally {
      if (saved === undefined) delete process.env.ANTHROPIC_API_KEY
      else process.env.ANTHROPIC_API_KEY = saved
    }
  })
})

describe('agentEnv', () => {
  it('gives the SDK child the caller\'s key and the basics, not the worker\'s environment', () => {
    const env = agentEnv('sk-from-caller', worker)
    expect(env.ANTHROPIC_API_KEY).toBe('sk-from-caller')
    expect(Object.values(env).join(' ')).not.toMatch(/secret|sk-worker/)
  })

  it('refuses to run without a key', () => {
    expect(() => agentEnv('', worker)).toThrow(/API key/)
  })

  it('is what every job runs with', () => {
    const ctx = { root: '/tmp/x', written: new Set() } as unknown as ToolContext
    const options = jobOptions({ jobs: [], context: ctx, apiKey: 'sk-from-caller', budgetUsd: 1 }, { id: 'a', prompt: 'p', role: 'write' }, 1, [])
    expect(options.env?.ANTHROPIC_API_KEY).toBe('sk-from-caller')
    expect(Object.keys(options.env ?? {}).toSorted()).toEqual(Object.keys(agentEnv('k')).toSorted())
  })
})

describe('pricing', () => {
  it('prices a turn per model, cache reads and writes included', () => {
    expect(usdOf('claude-opus-5-5', { input_tokens: 1_000_000 })).toBe(4)
    expect(usdOf('claude-opus-5-5', { output_tokens: 1_000_000, cache_read_input_tokens: 1_000_000 })).toBe(20.2)
    expect(usdOf('claude-sonnet-5', { input_tokens: 1_000_000, output_tokens: 1_000_000, cache_creation_input_tokens: 1_000_000 })).toBe(14.5)
  })

  it('prices an unknown model as the most expensive, so the cap errs early', () => {
    expect(usdOf('claude-next', { input_tokens: 1_000_000 })).toBe(4)
  })

  it('a local budget throws AiBudgetExceeded past its cap', () => {
    const budget = localBudget(1, 1000)
    budget.charge({ stage: 'writer', model: 'm', tokensIn: 0, tokensOut: 0, usd: 0.6 })
    expect(budget.canSpend(0.5)).toBe(false)
    expect(() => budget.charge({ stage: 'writer', model: 'm', tokensIn: 0, tokensOut: 0, usd: 0.6 })).toThrow(expect.objectContaining({ name: 'AiBudgetExceeded' }))
  })
})
