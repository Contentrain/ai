import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// Real git; contends with the other git suites.
vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 })
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createGit } from '../../src/git/identity.js'
import { loadRefSnapshot } from '../../src/git/ref-snapshot.js'
import { initGitRepo } from '../support/project.js'

/** #229 — the snapshot reader behind feature-branch content reads. */
describe('RefSnapshotReader', () => {
  let dir: string
  let commit: string
  const multibyte = '{\n  "title": "Çalışma saatleri — 営業時間 🕘"\n}\n'
  // Over the batch limit (1 MB) and outside the content extensions: both read on demand.
  const large = `{"body":"${'x'.repeat(1024 * 1024)}"}\n`
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"/>\n'

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cr-ref-snapshot-'))
    await initGitRepo(dir)
    await mkdir(join(dir, '.contentrain/content/blog/posts'), { recursive: true })
    await writeFile(join(dir, '.contentrain/config.json'), '{"version":1}\n')
    await writeFile(join(dir, '.contentrain/content/blog/posts/tr.json'), multibyte)
    // Same bytes twice: one blob, two paths.
    await writeFile(join(dir, '.contentrain/content/blog/posts/en.json'), multibyte)
    await writeFile(join(dir, '.contentrain/content/blog/empty.json'), '')
    await writeFile(join(dir, 'app.vue'), '<template />\n')
    await mkdir(join(dir, '.contentrain/assets'), { recursive: true })
    await writeFile(join(dir, '.contentrain/assets/logo.svg'), svg)
    await writeFile(join(dir, '.contentrain/content/blog/large.json'), large)
    const git = createGit(dir)
    await git.add('.')
    await git.commit('content', { '--no-verify': null })
    commit = (await git.raw(['rev-parse', 'HEAD'])).trim()
    // Moving the working tree on afterwards must not reach the snapshot.
    await writeFile(join(dir, '.contentrain/config.json'), '{"version":2}\n')
  })

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('reads blobs from the commit, byte-exact through multi-byte UTF-8, empty files and shared blobs', async () => {
    const snap = await loadRefSnapshot(dir, commit, '.contentrain')
    expect(await snap.readFile('.contentrain/config.json')).toBe('{"version":1}\n')
    expect(await snap.readFile('.contentrain/content/blog/posts/tr.json')).toBe(multibyte)
    expect(await snap.readFile('.contentrain/content/blog/posts/en.json')).toBe(multibyte)
    expect(await snap.readFile('.contentrain/content/blog/empty.json')).toBe('')
  })

  it('reads a large or non-content file on demand, byte-exact', async () => {
    const snap = await loadRefSnapshot(dir, commit, '.contentrain')
    expect(await snap.readFile('.contentrain/assets/logo.svg')).toBe(svg)
    expect(await snap.readFile('.contentrain/content/blog/large.json')).toBe(large)
    // The batch still serves content read after them.
    expect(await snap.readFile('.contentrain/config.json')).toBe('{"version":1}\n')
  })

  it('lists one level, sorted, and answers existence for files and directories', async () => {
    const snap = await loadRefSnapshot(dir, commit, '.contentrain')
    expect(await snap.listDirectory('.contentrain')).toEqual(['assets', 'config.json', 'content'])
    expect(await snap.listDirectory('.contentrain/content/blog/')).toEqual(['empty.json', 'large.json', 'posts'])
    expect(await snap.listDirectory('.contentrain/missing')).toEqual([])
    expect(await snap.fileExists('.contentrain/content/blog')).toBe(true)
    expect(await snap.fileExists('./.contentrain/content/blog/posts/tr.json')).toBe(true)
    expect(await snap.fileExists('.contentrain/content/blog/posts/de.json')).toBe(false)
  })

  it('holds only the subtree it was built for; a missing path throws ENOENT', async () => {
    const snap = await loadRefSnapshot(dir, commit, '.contentrain')
    expect(await snap.fileExists('app.vue')).toBe(false)
    await expect(snap.readFile('app.vue')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('is cached per commit', async () => {
    expect(await loadRefSnapshot(dir, commit, '.contentrain')).toBe(await loadRefSnapshot(dir, commit, '.contentrain'))
  })
})
