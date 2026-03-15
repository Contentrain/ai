import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { WORKFLOW_SKILLS, FRAMEWORK_GUIDES } from '../src/index.js'

const PKG_ROOT = join(import.meta.dirname, '..')

describe('workflow skills', () => {
  for (const skill of WORKFLOW_SKILLS) {
    const filePath = join(PKG_ROOT, 'workflows', `${skill}.md`)
    it(`workflows/${skill}.md exists`, () => {
      expect(existsSync(filePath)).toBe(true)
    })
    it(`workflows/${skill}.md references contentrain`, async () => {
      const content = await readFile(filePath, 'utf-8')
      expect(content.toLowerCase()).toContain('contentrain')
    })
  }
})

describe('framework guides', () => {
  for (const fw of FRAMEWORK_GUIDES) {
    it(`frameworks/${fw}.md exists`, () => {
      expect(existsSync(join(PKG_ROOT, 'frameworks', `${fw}.md`))).toBe(true)
    })
  }
})
