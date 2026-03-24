import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { AGENT_SKILLS, WORKFLOW_SKILLS, FRAMEWORK_GUIDES } from '../src/index.js'

const PKG_ROOT = join(import.meta.dirname, '..')

describe('agent skills (standard format)', () => {
  for (const skill of AGENT_SKILLS) {
    const skillDir = join(PKG_ROOT, 'skills', skill.name)
    const skillFile = join(skillDir, 'SKILL.md')

    it(`skills/${skill.name}/SKILL.md exists`, () => {
      expect(existsSync(skillFile)).toBe(true)
    })

    it(`skills/${skill.name}/SKILL.md has valid frontmatter`, () => {
      const content = readFileSync(skillFile, 'utf-8')
      expect(content.startsWith('---\n')).toBe(true)
      expect(content).toContain(`name: ${skill.name}`)
      expect(content).toContain('description:')
    })

    it(`skills/${skill.name}/SKILL.md is under 500 lines`, () => {
      const content = readFileSync(skillFile, 'utf-8')
      const lines = content.split('\n').length
      expect(lines).toBeLessThanOrEqual(500)
    })
  }
})

describe('workflow skills (backward compat)', () => {
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

describe('workflow coverage', () => {
  it('model skill uses model design tools', () => {
    const model = readFileSync(join(PKG_ROOT, 'workflows', 'contentrain-model.md'), 'utf-8')
    expect(model).toContain('contentrain_model_save')
    expect(model).toContain('contentrain_describe_format')
  })

  it('bulk skill documents contentrain_bulk', () => {
    const bulk = readFileSync(join(PKG_ROOT, 'workflows', 'contentrain-bulk.md'), 'utf-8')
    expect(bulk).toContain('contentrain_bulk')
  })

  it('validate-fix skill documents validation reruns', () => {
    const validateFix = readFileSync(join(PKG_ROOT, 'workflows', 'contentrain-validate-fix.md'), 'utf-8')
    expect(validateFix).toContain('contentrain_validate')
    expect(validateFix).toContain('validate again')
  })

  it('serve skill documents web UI and stdio modes', () => {
    const serve = readFileSync(join(PKG_ROOT, 'workflows', 'contentrain-serve.md'), 'utf-8')
    expect(serve).toContain('contentrain serve')
    expect(serve).toContain('--stdio')
  })
})

describe('package surface', () => {
  it('README.md exists', () => {
    expect(existsSync(join(PKG_ROOT, 'README.md'))).toBe(true)
  })
})
