import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const PKG_ROOT = join(import.meta.dirname, '..')

/**
 * Every path in `exports` must exist in `dist`. Nothing else catches a wrong
 * one: the package builds, publishes and imports fine at runtime while the
 * `types` condition points at a file that was never emitted — every subpath of
 * this package shipped without types that way, because tsdown writes
 * `.d.mts`/`.d.cts` and the manifest asked for `.d.ts`.
 */
describe('package exports', () => {
  it('resolves every declared export to a file that exists', async () => {
    const pkg = JSON.parse(await readFile(join(PKG_ROOT, 'package.json'), 'utf8')) as {
      exports: Record<string, unknown>
      types?: string
      main?: string
      module?: string
      bin?: Record<string, string>
    }
    if (!existsSync(join(PKG_ROOT, 'dist'))) {
      throw new Error('dist/ is missing — run `pnpm build` before `pnpm test` (packages read dist).')
    }

    const paths: string[] = []
    const collect = (value: unknown) => {
      if (typeof value === 'string') {
        // Wildcard subpaths point at a directory of hand-written files.
        if (!value.includes('*')) paths.push(value)
        return
      }
      if (value && typeof value === 'object') {
        for (const nested of Object.values(value as Record<string, unknown>)) collect(nested)
      }
    }
    collect(pkg.exports)
    for (const legacy of [pkg.types, pkg.main, pkg.module]) if (legacy) paths.push(legacy)
    for (const bin of Object.values(pkg.bin ?? {})) paths.push(bin)

    expect(paths.length).toBeGreaterThan(8)
    const missing = paths.filter(rel => !existsSync(join(PKG_ROOT, rel)))
    expect(missing).toEqual([])
  })

  it('gives the astro subpath its own types, not the root ones', async () => {
    const pkg = JSON.parse(await readFile(join(PKG_ROOT, 'package.json'), 'utf8')) as {
      exports: Record<string, { import?: { types?: string } }>
    }
    expect(pkg.exports['./astro']?.import?.types).toBe('./dist/astro/index.d.mts')
    const dts = await readFile(join(PKG_ROOT, 'dist/astro/index.d.mts'), 'utf8')
    expect(dts).toContain('contentrainLoader')
    expect(dts).toContain('ContentrainLoaderOptions')
  })
})
