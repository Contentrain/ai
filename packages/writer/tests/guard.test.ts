import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { GuardError, readablePath, writablePath } from '../src/guard'

let root: string

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'writer-guard-'))
  await mkdir(join(root, '.contentrain', 'content', 'blog', 'posts'), { recursive: true })
  await mkdir(join(root, '.contentrain', 'models'), { recursive: true })
  await mkdir(join(root, 'src', 'views'), { recursive: true })
  await writeFile(join(root, '.contentrain', 'content', 'blog', 'posts', 'data.json'), '{"a":{"title":"Hello"}}\n')
  await writeFile(join(root, '.contentrain', 'models', 'posts.json'), '{"id":"posts"}\n')
  await symlink(join(root, '.contentrain'), join(root, 'src', 'views', 'escape'))
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('writablePath — the agent never writes content', () => {
  const refused = [
    '.contentrain/content/blog/posts/data.json',
    '.contentrain/models/posts.json',
    '.contentrain/meta/posts/en.json',
    '.contentrain/config.json',
    'src/content.config.ts',
    'src/site.config.ts',
    'astro.config.mjs',
    'package.json',
    'redirects.json',
    'public/data.json',
    'src/pages/index.astro',
    'src/styles/global.css',
    'src/views/../../.contentrain/content/blog/posts/data.json',
    '../outside.astro',
    '/etc/passwd',
    'src/views/escape/content/blog/posts/data.json',
    'src/views/notes.json',
    'src/views/data.md',
  ]
  for (const path of refused) {
    it(`refuses ${path}`, async () => {
      await expect(writablePath(root, path)).rejects.toBeInstanceOf(GuardError)
    })
  }

  for (const path of ['src/views/Home.astro', 'src/views/composed/About.astro', 'src/components/site/Hero.astro', 'src/components/site/lib.ts', 'src/styles/site.css']) {
    it(`allows ${path}`, async () => {
      expect(await writablePath(root, path)).toBe(join(root, path))
    })
  }
})

describe('readablePath — models yes, content no', () => {
  it('reads models', async () => {
    expect(await readFile(await readablePath(root, '.contentrain/models/posts.json'), 'utf8')).toContain('posts')
  })
  for (const path of ['.contentrain/content/blog/posts/data.json', '.contentrain/meta/posts/en.json', '.env', 'src/views/escape/content/blog/posts/data.json', 'src/../.contentrain/content/blog/posts/data.json']) {
    it(`refuses ${path}`, async () => {
      await expect(readablePath(root, path)).rejects.toBeInstanceOf(GuardError)
    })
  }
})
