import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { FIELD_TYPES, MODEL_KINDS, MCP_TOOLS, ALL_SHARED_RULES, IDE_RULE_FILES } from '../src/index.js'

const PKG_ROOT = join(import.meta.dirname, '..')

describe('shared rules', () => {
  for (const rule of ALL_SHARED_RULES) {
    it(`shared/${rule}.md exists`, () => {
      expect(existsSync(join(PKG_ROOT, 'shared', `${rule}.md`))).toBe(true)
    })
  }
})

describe('constants', () => {
  it('FIELD_TYPES has 27 entries', () => { expect(FIELD_TYPES).toHaveLength(27) })
  it('MODEL_KINDS has 4 entries', () => { expect(MODEL_KINDS).toHaveLength(4) })
  it('MCP_TOOLS has 15 entries', () => { expect(MCP_TOOLS).toHaveLength(15) })
  it('all MCP tools match pattern', () => {
    for (const t of MCP_TOOLS) expect(t).toMatch(/^contentrain_/)
  })
})

describe('IDE bundles', () => {
  for (const [ide, path] of Object.entries(IDE_RULE_FILES)) {
    it(`${ide} bundle exists`, () => {
      expect(existsSync(join(PKG_ROOT, path))).toBe(true)
    })
  }
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
