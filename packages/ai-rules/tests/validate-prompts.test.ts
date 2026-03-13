import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FRAMEWORKS, SKILLS } from '../src/index.js'

const PKG_ROOT = join(import.meta.dirname, '..')

const PROMPT_FILES = [
  'common.md',
  'generate-mode.md',
  'normalize-mode.md',
  'review-mode.md',
]

const PROMPT_EXPECTED_HEADINGS: Record<string, string[]> = {
  'common.md': ['Identity'],
  'generate-mode.md': ['Pipeline'],
  'normalize-mode.md': ['Architecture Overview'],
  'review-mode.md': ['Pipeline'],
}

describe('prompt files', () => {
  it('should have exactly 4 prompt files', () => {
    expect(PROMPT_FILES).toHaveLength(4)
  })

  for (const file of PROMPT_FILES) {
    const filePath = join(PKG_ROOT, 'prompts', file)

    it(`prompts/${file} exists`, () => {
      expect(existsSync(filePath)).toBe(true)
    })

    it(`prompts/${file} is non-empty`, async () => {
      const content = await readFile(filePath, 'utf-8')
      expect(content.trim().length).toBeGreaterThan(0)
    })

    it(`prompts/${file} contains expected sections`, async () => {
      const content = await readFile(filePath, 'utf-8')
      const expectedHeadings = PROMPT_EXPECTED_HEADINGS[file]
      for (const heading of expectedHeadings) {
        expect(content).toContain(`## ${heading}`)
      }
    })
  }
})

describe('skill files', () => {
  it('SKILLS constant has exactly 6 entries', () => {
    expect(SKILLS).toHaveLength(6)
  })

  for (const skill of SKILLS) {
    const fileName = `${skill}.md`
    const filePath = join(PKG_ROOT, 'skills', fileName)

    it(`skills/${fileName} exists`, () => {
      expect(existsSync(filePath)).toBe(true)
    })

    it(`skills/${fileName} is non-empty`, async () => {
      const content = await readFile(filePath, 'utf-8')
      expect(content.trim().length).toBeGreaterThan(0)
    })

    it(`skills/${fileName} references Contentrain tools, commands, or conventions`, async () => {
      const content = await readFile(filePath, 'utf-8')
      expect(content).toMatch(/contentrain[_\-/]/)
    })
  }
})

describe('framework files', () => {
  it('FRAMEWORKS constant has exactly 4 entries', () => {
    expect(FRAMEWORKS).toHaveLength(4)
  })

  for (const fw of FRAMEWORKS) {
    const fileName = `${fw}.md`
    const filePath = join(PKG_ROOT, 'frameworks', fileName)

    it(`frameworks/${fileName} exists`, () => {
      expect(existsSync(filePath)).toBe(true)
    })

    it(`frameworks/${fileName} is non-empty`, async () => {
      const content = await readFile(filePath, 'utf-8')
      expect(content.trim().length).toBeGreaterThan(0)
    })

    it(`frameworks/${fileName} does not teach unsupported SDK APIs`, async () => {
      const content = await readFile(filePath, 'utf-8')
      expect(content).not.toContain('.filter(')
      expect(content).not.toContain('.byId(')
      expect(content).not.toContain("dictionary('ui-labels').locale('en').all()")
    })
  }
})

describe('context bridge', () => {
  const filePath = join(PKG_ROOT, 'context', 'context-bridge.md')

  it('context-bridge.md exists', () => {
    expect(existsSync(filePath)).toBe(true)
  })

  it('context-bridge.md is non-empty', async () => {
    const content = await readFile(filePath, 'utf-8')
    expect(content.trim().length).toBeGreaterThan(0)
  })
})

describe('skill API examples', () => {
  it('contentrain-generate skill does not teach unsupported query syntax', async () => {
    const content = await readFile(join(PKG_ROOT, 'skills', 'contentrain-generate.md'), 'utf-8')
    expect(content).not.toContain(".where('status', 'eq', 'published')")
    // .get() is invalid on QueryBuilder but valid on singleton/dictionary
    for (const line of content.split('\n')) {
      if (line.includes('query(') && line.includes('.get()')) {
        expect.unreachable(`Line uses .get() on query(): ${line.trim()}`)
      }
    }
    expect(content).not.toContain('await query(')
  })
})
