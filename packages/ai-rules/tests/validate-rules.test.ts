import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ALL_SHARED_RULES,
  ARCHITECTURE_RULES,
  CONTENT_QUALITY_RULES,
  FIELD_TYPES,
  IDE_RULE_FILES,
  MCP_TOOLS,
  MODEL_KINDS,
} from '../src/index.js'

const PKG_ROOT = join(import.meta.dirname, '..')
const SHARED_DIR = join(PKG_ROOT, 'rules', 'shared')

// RULE_ORDER from build-rules.ts — must stay in sync with constants
const RULE_ORDER = [
  'content-quality.md',
  'seo-rules.md',
  'i18n-quality.md',
  'accessibility-rules.md',
  'security-rules.md',
  'media-rules.md',
  'content-conventions.md',
  'schema-rules.md',
  'mcp-usage.md',
  'workflow-rules.md',
  'normalize-rules.md',
]

describe('shared rule files', () => {
  it('should have exactly 11 shared rules', () => {
    expect(ALL_SHARED_RULES).toHaveLength(11)
  })

  for (const rule of ALL_SHARED_RULES) {
    const fileName = `${rule}.md`
    const filePath = join(SHARED_DIR, fileName)

    it(`${fileName} exists`, () => {
      expect(existsSync(filePath)).toBe(true)
    })

    it(`${fileName} is non-empty and starts with a markdown heading`, async () => {
      const content = await readFile(filePath, 'utf-8')
      expect(content.trim().length).toBeGreaterThan(0)
      expect(content.trimStart()).toMatch(/^#{1,3}\s/)
    })
  }
})

describe('RULE_ORDER matches constants', () => {
  it('RULE_ORDER matches CONTENT_QUALITY_RULES + ARCHITECTURE_RULES with .md suffix', () => {
    const expectedOrder = [
      ...CONTENT_QUALITY_RULES.map(r => `${r}.md`),
      ...ARCHITECTURE_RULES.map(r => `${r}.md`),
    ]
    expect(RULE_ORDER).toEqual(expectedOrder)
  })
})

describe('MCP_TOOLS', () => {
  it('has exactly 13 entries', () => {
    expect(MCP_TOOLS).toHaveLength(13)
  })

  it('all tool names follow the contentrain_* pattern', () => {
    for (const tool of MCP_TOOLS) {
      expect(tool).toMatch(/^contentrain_[a-z_]+$/)
    }
  })
})

describe('FIELD_TYPES', () => {
  it('has exactly 27 entries', () => {
    expect(FIELD_TYPES).toHaveLength(27)
  })
})

describe('MODEL_KINDS', () => {
  it('has exactly 4 entries', () => {
    expect(MODEL_KINDS).toHaveLength(4)
  })
})

describe('IDE_RULE_FILES', () => {
  it('all paths follow expected patterns', () => {
    for (const [ide, path] of Object.entries(IDE_RULE_FILES)) {
      expect(path).toMatch(/^rules\/[a-z-]+\/contentrain\.\w+$/)
      expect(path).toContain(ide)
    }
  })

  it('matches the documented Windsurf rules filename', () => {
    expect(IDE_RULE_FILES.windsurf).toBe('rules/windsurf/contentrain.windsurfrules')
  })
})

describe('built IDE bundles', () => {
  it('claude-code bundle references framework-specific guidance', async () => {
    const filePath = join(PKG_ROOT, IDE_RULE_FILES['claude-code'])
    const content = await readFile(filePath, 'utf-8')
    expect(content).toMatch(/framework|nuxt|next|astro|sveltekit/i)
  })
})
