import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FIELD_TYPES, MODEL_KINDS, MCP_TOOLS, ESSENTIAL_RULES_FILE } from '../src/index.js'

const PKG_ROOT = join(import.meta.dirname, '..')

describe('essential rules', () => {
  it('essential guardrails file exists', () => {
    expect(existsSync(join(PKG_ROOT, ESSENTIAL_RULES_FILE))).toBe(true)
  })

  it('essential guardrails is under 150 lines', () => {
    const content = readFileSync(join(PKG_ROOT, ESSENTIAL_RULES_FILE), 'utf-8')
    const lines = content.split('\n').length
    expect(lines).toBeLessThanOrEqual(150)
  })

  it('essential guardrails mentions all MCP tools', () => {
    const content = readFileSync(join(PKG_ROOT, ESSENTIAL_RULES_FILE), 'utf-8')
    for (const t of MCP_TOOLS) expect(content).toContain(t)
  })
})

describe('constants', () => {
  it('FIELD_TYPES has 27 entries', () => { expect(FIELD_TYPES).toHaveLength(27) })
  it('MODEL_KINDS has 4 entries', () => { expect(MODEL_KINDS).toHaveLength(4) })
  it('MCP_TOOLS has 15 entries', () => { expect(MCP_TOOLS).toHaveLength(15) })
  it('all MCP tools match pattern', () => {
    for (const t of MCP_TOOLS) expect(t).toMatch(/^contentrain_/)
  })
})

describe('prompts', () => {
  for (const file of ['common.md', 'generate-mode.md', 'normalize-mode.md', 'review-mode.md']) {
    it(`prompts/${file} exists`, () => {
      expect(existsSync(join(PKG_ROOT, 'prompts', file))).toBe(true)
    })
  }
})

describe('context', () => {
  it('context-bridge.md exists', () => {
    expect(existsSync(join(PKG_ROOT, 'context', 'context-bridge.md'))).toBe(true)
  })
})
