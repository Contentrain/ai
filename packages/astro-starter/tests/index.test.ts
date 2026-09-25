import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { copyStarter, STARTER_DIR } from '../src/index'

const out = await mkdtemp(join(tmpdir(), 'astro-starter-'))
afterAll(() => rm(out, { recursive: true, force: true }))

describe('STARTER_DIR', () => {
  it('is the starter: a package, an Astro config, the pages and the content store', () => {
    expect(JSON.parse(readFileSync(join(STARTER_DIR, 'package.json'), 'utf8')).name).toBe('contentrain-astro-starter')
    for (const path of ['astro.config.mjs', 'src/site.config.ts', 'src/pages', '.contentrain/config.json', 'pnpm-lock.yaml']) {
      expect(existsSync(join(STARTER_DIR, path)), path).toBe(true)
    }
  })
})

describe('copyStarter', () => {
  it('copies what the filter keeps, with the .gitignore under its own name', async () => {
    await copyStarter(join(out, 'site'), { filter: path => !path.startsWith('public') && !path.startsWith('node_modules') })
    expect(existsSync(join(out, 'site', 'astro.config.mjs'))).toBe(true)
    expect(existsSync(join(out, 'site', '.gitignore'))).toBe(true)
    expect(existsSync(join(out, 'site', '_gitignore'))).toBe(false)
    expect(existsSync(join(out, 'site', 'public'))).toBe(false)
  })
})
