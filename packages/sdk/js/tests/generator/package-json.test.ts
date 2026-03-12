import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { injectImports } from '../../src/generator/package-json.js'
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('package-json injection', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = join(tmpdir(), `contentrain-test-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('adds #contentrain imports to fresh package.json', async () => {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }, null, 2) + '\n')

    const updated = await injectImports(tmpDir)
    expect(updated).toBe(true)

    const pkg = JSON.parse(readFileSync(join(tmpDir, 'package.json'), 'utf-8'))
    expect(pkg.imports['#contentrain']).toBeDefined()
    expect(pkg.imports['#contentrain'].import).toBe('./.contentrain/client/index.mjs')
    expect(pkg.imports['#contentrain/*']).toBeDefined()
  })

  it('is idempotent — no change on second run', async () => {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }, null, 2) + '\n')

    await injectImports(tmpDir)
    const updated = await injectImports(tmpDir)
    expect(updated).toBe(false)
  })

  it('preserves existing package.json fields', async () => {
    const original = { name: 'my-app', version: '1.0.0', dependencies: { vue: '^3.0' } }
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify(original, null, 2) + '\n')

    await injectImports(tmpDir)

    const pkg = JSON.parse(readFileSync(join(tmpDir, 'package.json'), 'utf-8'))
    expect(pkg.name).toBe('my-app')
    expect(pkg.version).toBe('1.0.0')
    expect(pkg.dependencies.vue).toBe('^3.0')
    expect(pkg.imports['#contentrain']).toBeDefined()
  })
})
