import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
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

  it('nuxt guide treats #contentrain as server-only', () => {
    const nuxt = readFileSync(join(PKG_ROOT, 'frameworks', 'nuxt.md'), 'utf-8')
    expect(nuxt).toContain('Treat this import as **server-only** in Nuxt.')
    expect(nuxt).not.toContain('works in server routes, composables, plugins, and `<script setup>` blocks')
  })

  it('vue guide documents direct SFC usage', () => {
    const vue = readFileSync(join(PKG_ROOT, 'frameworks', 'vue.md'), 'utf-8')
    expect(vue).toContain('Vue 3 + Vite')
    expect(vue).toContain("import { query, singleton, dictionary } from '#contentrain'")
  })

  it('react guide documents direct SPA component usage', () => {
    const react = readFileSync(join(PKG_ROOT, 'frameworks', 'react.md'), 'utf-8')
    expect(react).toContain('React + Vite')
    expect(react).toContain("import { query, singleton, dictionary } from '#contentrain'")
  })

  it('expo guide documents require(...).init() bootstrap', () => {
    const expo = readFileSync(join(PKG_ROOT, 'frameworks', 'expo.md'), 'utf-8')
    expect(expo).toContain("require('#contentrain').init()")
  })

  it('react-native guide documents Metro bootstrap', () => {
    const reactNative = readFileSync(join(PKG_ROOT, 'frameworks', 'react-native.md'), 'utf-8')
    expect(reactNative).toContain("require('#contentrain').init()")
    expect(reactNative).toContain('bare React Native / Metro')
  })

  it('node guide documents both ESM and CJS consumption', () => {
    const node = readFileSync(join(PKG_ROOT, 'frameworks', 'node.md'), 'utf-8')
    expect(node).toContain("import { query, singleton, dictionary, document } from '#contentrain'")
    expect(node).toContain("await require('#contentrain').init()")
  })
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
