import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { main, parseArgs } from './cli'
import { loadSiteDirectory } from './load'

const SITE = 'https://example.com'

let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'cr-verify-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

async function write(path: string, content: string): Promise<void> {
  const full = join(dir, path)
  await mkdir(dirname(full), { recursive: true })
  await writeFile(full, content)
}

const clean = (url: string) => `<html lang="en"><head>
<title>${url}</title>
<meta name="description" content="d">
<meta property="og:title" content="t"><meta property="og:type" content="website"><meta property="og:url" content="${SITE}${url}">
<meta name="twitter:card" content="summary">
<link rel="canonical" href="${SITE}${url}">
</head><body><p>x</p></body></html>`

function capture() {
  const lines: string[] = []
  const errors: string[] = []
  return { io: { log: (l: string) => lines.push(l), error: (l: string) => errors.push(l) }, lines, errors }
}

describe('parseArgs', () => {
  it('reads the directory and the flags', () => {
    const args = parseArgs(['dist', '--site', SITE, '--json', '--groups', 'identity,assets', '--max-redirect-hops', '3'])
    expect(args).toMatchObject({ dir: 'dist', site: SITE, json: true, groups: ['identity', 'assets'], maxRedirectHops: 3 })
  })

  it('rejects what it does not understand instead of ignoring it', () => {
    expect(() => parseArgs(['dist', '--groups', 'identity,nonsense'])).toThrow(/nonsense/)
    expect(() => parseArgs(['dist', '--unknown'])).toThrow(/unknown option/)
    expect(() => parseArgs(['dist', '--max-redirect-hops', 'lots'])).toThrow(/non-negative integer/)
  })

  it('takes the first positional as the directory', () => {
    expect(parseArgs(['a', 'b']).dir).toBe('a')
  })
})

describe('loadSiteDirectory', () => {
  it('serves index.html at its directory and treats the rest as assets', async () => {
    await write('index.html', clean('/'))
    await write('about/index.html', clean('/about/'))
    await write('img/a.png', 'binary-ish')
    await write('sitemap.xml', `<urlset><url><loc>${SITE}/</loc></url></urlset>`)

    const loaded = await loadSiteDirectory(dir, SITE)
    expect(loaded.documents.map(d => d.url).toSorted()).toEqual(['/about/index.html', '/index.html'])
    expect(loaded.assets).toContain('/img/a.png')
    expect(loaded.sitemap).toContain('<loc>')
    // The sitemap is an asset too — it is a file the build serves.
    expect(loaded.assets).toContain('/sitemap.xml')
  })
})

describe('main', () => {
  it('exits 0 on a clean build and 1 when something is an error', async () => {
    await write('index.html', clean('/'))
    await write('404.html', clean('/404'))
    const ok = capture()
    expect(await main([dir, '--site', SITE], ok.io)).toBe(0)
    expect(ok.lines.join('\n')).toContain('PASS')

    await write('broken/index.html', clean('/broken/').replace('<p>x</p>', '<a href="/nowhere">x</a>'))
    const bad = capture()
    expect(await main([dir, '--site', SITE], bad.io)).toBe(1)
    expect(bad.lines.join('\n')).toContain('navigation.broken-internal-link')
  })

  it('prints JSON a caller can parse', async () => {
    await write('index.html', clean('/'))
    await write('404.html', clean('/404'))
    const io = capture()
    expect(await main([dir, '--site', SITE, '--json'], io.io)).toBe(0)
    const report = JSON.parse(io.lines[0]!) as { passed: boolean, documents: number }
    expect(report.passed).toBe(true)
    // The page and the 404 page a build must carry.
    expect(report.documents).toBe(2)
  })

  it('reads redirect rules from a file', async () => {
    await write('index.html', clean('/'))
    await write('404.html', clean('/404'))
    const rules = join(dir, 'redirects.json')
    await writeFile(rules, JSON.stringify([{ from: '/old', to: '/gone', status: 301 }]))
    const io = capture()
    expect(await main([dir, '--site', SITE, '--redirects', rules], io.io)).toBe(1)
    expect(io.lines.join('\n')).toContain('status.redirect-target-missing')
  })

  it('compares against a baseline directory', async () => {
    await write('index.html', clean('/').replace('<p>x</p>', '<img src="/i.png" alt="">'))
    await write('i.png', 'x')
    const before = await mkdtemp(join(tmpdir(), 'cr-verify-base-'))
    await writeFile(join(before, 'index.html'), clean('/').replace('<p>x</p>', '<img src="/i.png" alt="A goat">'))

    const io = capture()
    await main([dir, '--site', SITE, '--baseline', before], io.io)
    expect(io.lines.join('\n')).toContain('assets.alt-lost')
    await rm(before, { recursive: true, force: true })
  })

  it('explains itself and exits 2 without a directory', async () => {
    const io = capture()
    expect(await main([], io.io)).toBe(2)
    expect(io.lines.join('\n')).toContain('contentrain-verify <dist-dir>')
    expect(await main(['--help'], io.io)).toBe(0)
  })

  it('exits 2 with the usage text on a bad flag', async () => {
    const io = capture()
    expect(await main(['dist', '--nope'], io.io)).toBe(2)
    expect(io.errors.join('\n')).toContain('unknown option')
  })
})
