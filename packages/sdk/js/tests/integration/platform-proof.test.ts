import { describe, it, expect, afterEach } from 'vitest'
import { access, cp, mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { generate } from '../../src/generator/generate.js'

const BASE_FIXTURE = join(import.meta.dirname, '../fixtures/basic-blog')
const PLATFORM_FIXTURES = join(import.meta.dirname, '../fixtures/platform-proof')

const tempRoots: string[] = []

async function createPlatformProject(name: string): Promise<string> {
  const tempRoot = await mkdtemp(join(tmpdir(), `contentrain-sdk-platform-${name}-`))
  tempRoots.push(tempRoot)
  await cp(BASE_FIXTURE, tempRoot, { recursive: true })
  await cp(join(PLATFORM_FIXTURES, name), tempRoot, { recursive: true })
  return tempRoot
}

async function readPackageImports(projectRoot: string): Promise<Record<string, unknown>> {
  const pkg = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf-8')) as {
    imports?: Record<string, unknown>
  }
  return pkg.imports ?? {}
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('platform proof (integration)', () => {
  it('supports Vite/Vue-style ESM consumers through #contentrain imports', async () => {
    const projectRoot = await createPlatformProject('vite-vue')
    const result = await generate({ projectRoot })

    expect(result.packageJsonUpdated).toBe(true)

    const imports = await readPackageImports(projectRoot)
    expect(imports['#contentrain']).toBeDefined()

    const consumer = await import(pathToFileURL(join(projectRoot, 'src', 'content.mjs')).href)
    expect(consumer.run()).toEqual({
      heroTitle: 'Welcome to Contentrain',
      postCount: 3,
    })
  })

  it('supports Next/Webpack-style ESM server consumers through #contentrain imports', async () => {
    const projectRoot = await createPlatformProject('next-react')
    await generate({ projectRoot })

    const consumer = await import(pathToFileURL(join(projectRoot, 'app', 'lib', 'content.mjs')).href)
    expect(consumer.run()).toEqual({
      firstPostTitle: 'Getting Started with Contentrain',
      firstArticleSlug: 'design-tips',
    })
  })

  it('supports Node CommonJS consumers through require(...).init()', async () => {
    const projectRoot = await createPlatformProject('node-cjs')
    await generate({ projectRoot })

    const require = createRequire(import.meta.url)
    const consumer = require(join(projectRoot, 'server', 'content.cjs')) as {
      run: () => Promise<Record<string, unknown>>
    }

    await expect(access(join(projectRoot, '.contentrain', 'client', 'index.cjs'))).resolves.toBeUndefined()
    await expect(consumer.run()).resolves.toEqual({
      heroTitle: 'Welcome to Contentrain',
      missingMessage: 'Page not found',
    })
  })

  it('supports Expo/Metro-style CommonJS consumers through require(...).init()', async () => {
    const projectRoot = await createPlatformProject('expo-metro')
    await generate({ projectRoot })

    const require = createRequire(import.meta.url)
    const consumer = require(join(projectRoot, 'app', 'content.cjs')) as {
      run: () => Promise<Record<string, unknown>>
    }

    await expect(consumer.run()).resolves.toEqual({
      postTitle: 'Getting Started with Contentrain',
      articleCount: 2,
    })
  })
})
