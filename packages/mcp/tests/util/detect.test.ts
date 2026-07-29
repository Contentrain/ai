import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { detectStack } from '../../src/util/detect.js'

let testDir: string

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'cr-detect-test-'))
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

describe('detectStack', () => {
  it('detects Hugo projects from hugo.toml', async () => {
    await writeFile(join(testDir, 'hugo.toml'), 'baseURL = "https://example.com"\n')

    const stack = await detectStack(testDir)

    expect(stack).toBe('hugo')
  })
})

/**
 * Regression: detection walked UP for a monorepo root ("I am inside a package,
 * find the root") but never DOWN. When projectRoot IS the monorepo root — the
 * common case — its package.json holds only tooling, so a Next.js monorepo
 * reported `other`. The stack picks the replacement conventions during
 * normalize, so getting it wrong sends Phase 2 down the wrong path.
 */
describe('monorepo stack detection', () => {
  async function pkg(dir: string, deps: Record<string, string>): Promise<void> {
    const { mkdir } = await import('node:fs/promises')
    await mkdir(join(testDir, dir), { recursive: true })
    await writeFile(
      join(testDir, dir, 'package.json'),
      JSON.stringify({ name: dir || 'root', dependencies: deps }),
    )
  }

  it('finds the framework in a pnpm workspace package', async () => {
    await pkg('.', { turbo: '^2.0.0' })
    await writeFile(join(testDir, 'pnpm-workspace.yaml'), 'packages:\n  - "apps/*"\n')
    await pkg('apps/www', { next: '^15.0.0', react: '^19.0.0' })

    expect(await detectStack(testDir)).toBe('next')
  })

  it('finds it through the npm workspaces field too', async () => {
    const { mkdir } = await import('node:fs/promises')
    await mkdir(join(testDir, 'apps/site'), { recursive: true })
    await writeFile(
      join(testDir, 'package.json'),
      JSON.stringify({ name: 'root', workspaces: ['apps/*'], dependencies: {} }),
    )
    await pkg('apps/site', { nuxt: '^3.0.0' })

    expect(await detectStack(testDir)).toBe('nuxt')
  })

  it('prefers the meta-framework over plain UI packages', async () => {
    // jsoncrack's shape: one Next app plus React-only side packages. Counting
    // occurrences would answer "react"; the meta-framework is the right answer.
    await pkg('.', { turbo: '^2.0.0' })
    await writeFile(join(testDir, 'pnpm-workspace.yaml'), 'packages:\n  - "apps/*"\n')
    await pkg('apps/www', { next: '^15.0.0', react: '^19.0.0' })
    await pkg('apps/vscode', { react: '^19.0.0' })
    await pkg('apps/extension', { react: '^19.0.0' })

    expect(await detectStack(testDir)).toBe('next')
  })

  it('leaves a root-level framework alone', async () => {
    await pkg('.', { next: '^15.0.0' })
    expect(await detectStack(testDir)).toBe('next')
  })

  it('stays "other" when no workspace package has a framework', async () => {
    await pkg('.', { turbo: '^2.0.0' })
    await writeFile(join(testDir, 'pnpm-workspace.yaml'), 'packages:\n  - "apps/*"\n')
    await pkg('apps/tooling', { typescript: '^5.0.0' })

    expect(await detectStack(testDir)).toBe('other')
  })

  it('does not let a workspace file shadow non-JS detection', async () => {
    await pkg('.', {})
    await writeFile(join(testDir, 'pnpm-workspace.yaml'), 'packages:\n  - "apps/*"\n')
    await writeFile(join(testDir, 'go.mod'), 'module example.com/app\n')

    expect(await detectStack(testDir)).toBe('go')
  })
})

describe('monorepo feature detection', () => {
  it('reports an i18n library that lives in a workspace package', async () => {
    const { mkdir } = await import('node:fs/promises')
    const { detectStackInfo } = await import('../../src/util/detect.js')
    await mkdir(join(testDir, 'apps/www'), { recursive: true })
    await writeFile(join(testDir, 'package.json'), JSON.stringify({ name: 'root', dependencies: { turbo: '^2.0.0' } }))
    await writeFile(join(testDir, 'pnpm-workspace.yaml'), 'packages:\n  - "apps/*"\n')
    await writeFile(
      join(testDir, 'apps/www/package.json'),
      JSON.stringify({ name: 'www', dependencies: { next: '^15.0.0', 'next-intl': '^3.0.0' } }),
    )

    const info = await detectStackInfo(testDir)

    expect(info.stack).toBe('next')
    expect(info.monorepo).toBe(true)
    expect(info.features).toContain('i18n (next-intl)')
  })
})
