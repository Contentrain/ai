#!/usr/bin/env node
// Runs templates/astro-starter's gates the way a delivered site runs them:
// copied out of the monorepo into a directory of its own, installed from its
// own package.json, then `astro check`, `knip`, `astro build` + Pagefind and
// `scripts/check-dist.mjs`.
//
//   node scripts/starter-gates.mjs                      the empty starter
//   node scripts/starter-gates.mjs --fixture wp-demo    with templates/fixtures/wp-demo laid over it
//   node scripts/starter-gates.mjs --fixture tr-site    a Turkish-only site: config default locale tr, site.language tr (endpopcorn)
//   node scripts/starter-gates.mjs --fixture ar-site    an Arabic site: <html lang="ar" dir="rtl">
//   node scripts/starter-gates.mjs --local-sdk          @contentrain/query from this checkout, not npm
//   node scripts/starter-gates.mjs --out <dir>          keep the project there (default: a temp dir, removed on success)
//   node scripts/starter-gates.mjs --fixture wp-demo --media studio
//                                                       the fixture's media served as Contentrain Studio
//                                                       delivery URLs from a local stand-in, not from public/
//   node scripts/starter-gates.mjs --fixture wp-demo --menu mega
//                                                       site.config chrome.menu 'mega': the header menu as a mega panel
//   node scripts/starter-gates.mjs --frozen             install exactly the starter's lockfile — the published
//                                                       packages a delivered site gets (no --local-sdk)
//   node scripts/starter-gates.mjs --fixture wp-demo --base /blog/
//                                                       a WordPress installed in a directory: astro.config `base`, as a
//                                                       migration writes it; every address the site points at on itself
//                                                       must be inside the directory and lead to a built file
//
// --local-sdk tests the starter against the SDK at HEAD, so an SDK change
// that would break delivered sites fails here before it is released.
//
// A fixture is laid over the starter as files. Its `fixture.json` is not a
// site file: `dependencies` there are added after install, the way a
// migration adds what the kit components it copies need (embla-carousel for
// the slider). `absentFromDist` lists text no built file may contain: the
// titles and addresses of the fixture's drafts, which no menu, body link,
// sitemap or feed may reveal. `distFiles` names built files and text each
// must contain or must not (the host's redirect rules, a redirect page, the
// sitemap), and `distFilesByMedia` the same for one `--media` mode only. `optimizedInDist` names images that must reach dist as
// resized copies with a srcset, from public/ or from Studio's media host.

import { execFileSync, spawn } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { values } = parseArgs({
  options: {
    fixture: { type: 'string' },
    'local-sdk': { type: 'boolean', default: false },
    frozen: { type: 'boolean', default: false },
    out: { type: 'string' },
    media: { type: 'string', default: 'local' },
    menu: { type: 'string', default: 'flyout' },
    base: { type: 'string' },
  },
})

const starter = join(root, 'templates', 'astro-starter')

const placeholders = text => (String(text).match(/\{[^}]+\}/g) ?? []).toSorted().join(',')
// The bundled interface-string tables: every language has exactly English's keys and keeps its {placeholders}, so a
// table can never ship a gap or a broken template.
{
  const dir = join(starter, '.contentrain', 'content', 'site', 'ui-strings')
  const english = JSON.parse(readFileSync(join(dir, 'en.json'), 'utf8'))
  const problems = []
  for (const file of readdirSync(dir).filter(name => name.endsWith('.json') && name !== 'en.json')) {
    const table = JSON.parse(readFileSync(join(dir, file), 'utf8'))
    for (const key of Object.keys(english)) {
      if (typeof table[key] !== 'string' || !table[key].trim()) problems.push(`${file}: ${key} is missing`)
      else if (placeholders(table[key]) !== placeholders(english[key])) problems.push(`${file}: ${key} changes the placeholders of "${english[key]}"`)
    }
    for (const key of Object.keys(table)) if (!(key in english)) problems.push(`${file}: ${key} is not an English key`)
  }
  if (problems.length) throw new Error(`ui-strings tables disagree with en.json:\n${problems.join('\n')}`)
}

const project = values.out ? resolve(values.out) : mkdtempSync(join(tmpdir(), 'astro-starter-'))
const run = (command, args, cwd = project) => {
  console.log(`\n$ ${command} ${args.join(' ')}`)
  execFileSync(command, args, { cwd, stdio: 'inherit', env: { ...process.env, CI: 'true' } })
}

rmSync(project, { recursive: true, force: true })
cpSync(starter, project, {
  recursive: true,
  filter: source => !/\/(?:node_modules|dist|\.astro|\.lighthouseci)(?:\/|$)/.test(source.slice(starter.length)),
})
const fixtureDir = values.fixture ? join(root, 'templates', 'fixtures', values.fixture) : undefined
if (fixtureDir) cpSync(fixtureDir, project, { recursive: true, filter: source => source !== join(fixtureDir, 'fixture.json') })
const fixture = fixtureDir && existsSync(join(fixtureDir, 'fixture.json')) ? JSON.parse(readFileSync(join(fixtureDir, 'fixture.json'), 'utf8')) : {}
// `siteConfig`: lines of src/site.config.ts the fixture replaces ({ from, to }) — the settings a migration writes there.
for (const { from, to } of fixture.siteConfig ?? []) {
  const file = join(project, 'src', 'site.config.ts')
  const source = readFileSync(file, 'utf8')
  if (!source.includes(from)) throw new Error(`fixture.siteConfig: ${from} is not in src/site.config.ts`)
  writeFileSync(file, source.replace(from, to))
}
// `--menu mega` sets what a migration writes for a mega menu (`chrome.menu`); the default leaves site.config.ts as it is.
if (values.menu === 'mega') {
  const file = join(project, 'src', 'site.config.ts')
  const source = readFileSync(file, 'utf8')
  if (!source.includes('  sourceHosts: [],')) throw new Error('--menu mega: sourceHosts is not in src/site.config.ts')
  writeFileSync(file, source.replace('  sourceHosts: [],', "  chrome: { menu: 'mega' },\n  sourceHosts: [],"))
} else if (values.menu !== 'flyout') throw new Error(`--menu ${values.menu} is not flyout or mega`)
const fixtureDeps = Object.entries(fixture.dependencies ?? {})

// `--base /blog/`: the line a migration writes into astro.config.mjs for a WordPress installed in a directory.
const base = values.base === undefined ? '' : `/${values.base.replace(/^\/+|\/+$/g, '')}`
if (values.base !== undefined && !/^\/[a-z\d][a-z\d._~-]*(?:\/[a-z\d][a-z\d._~-]*)*$/i.test(base)) throw new Error(`--base ${values.base} is not a directory path (/blog/)`)
if (base) {
  const file = join(project, 'astro.config.mjs')
  const source = readFileSync(file, 'utf8')
  if (!source.includes('\n  site,\n')) throw new Error('--base: `site,` is not in astro.config.mjs')
  writeFileSync(file, source.replace('\n  site,\n', `\n  site,\n  base: '${base}/',\n`))
  // The fixture is a WordPress at its host's root. Installed in a directory, its absolute links to itself carry that
  // directory (`https://northwind.example/blog/roadmap/`); root-relative store paths (`/files/a.txt`) are relative to
  // the install and stay. Without this, every self link would point outside the directory: another application's.
  const siteFile = join(project, '.contentrain', 'content', 'site', 'site', 'data.json')
  // The store's site singleton: `{ url: 'https://northwind.example', … }`.
  const siteUrl = existsSync(siteFile) ? JSON.parse(readFileSync(siteFile, 'utf8'))?.url : undefined
  if (typeof siteUrl === 'string') {
    const host = new URL(siteUrl).hostname.replace(/^www\./, '').replaceAll('.', '\\.')
    const self = new RegExp(`(https?:\\/\\/(?:www\\.)?${host})(?=\\/)(?!${base}\\/)`, 'gi')
    const rewrite = (dir) => {
      if (!existsSync(dir)) return
      for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.json')) continue
        const path = join(entry.parentPath, entry.name)
        const text = readFileSync(path, 'utf8')
        const next = text.replace(self, `$1${base}`)
        if (next !== text) writeFileSync(path, next)
      }
    }
    rewrite(join(project, '.contentrain', 'content'))
    rewrite(join(project, 'src', 'data'))
  }
}

// Studio media: the media entries point at `<studio>/api/cdn/v1/<project>/…`, served by a
// child process (the build blocks this one) from the fixture's public/ files.
let studioServer
if (values.media === 'studio') {
  if (!fixtureDir) throw new Error('--media studio needs a --fixture')
  const server = `import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
const root = ${JSON.stringify(join(fixtureDir, 'public'))}
const prefix = '/api/cdn/v1/fixture/media/'
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  if (!path.startsWith(prefix) || path.includes('..')) { res.writeHead(404).end(); return }
  const rest = path.slice(prefix.length)
  try { res.writeHead(200).end(await readFile(join(root, 'media', rest)).catch(() => readFile(join(root, rest)))) } catch { res.writeHead(404).end() }
})
server.listen(0, '127.0.0.1', () => console.log(server.address().port))`
  studioServer = spawn(process.execPath, ['--input-type=module', '-e', server], { stdio: ['ignore', 'pipe', 'inherit'] })
  const port = await new Promise((done, failed) => {
    studioServer.stdout.once('data', chunk => done(String(chunk).trim()))
    studioServer.once('exit', code => failed(new Error(`studio media server exited (${code})`)))
  })
  // The stand-in must not keep this process alive once the gates are done.
  studioServer.removeAllListeners('exit')
  studioServer.stdout.destroy()
  studioServer.unref()
  // The binding as Studio writes it when it moves the media (Migration → Media), with media on a CDN host of its own
  // (the stand-in); the API origin is never fetched at build time.
  const studioUrl = `http://127.0.0.1:${port}`
  writeFileSync(join(project, 'studio.json'), `${JSON.stringify({ baseUrl: 'https://studio.invalid', mediaBaseUrl: `${studioUrl}/api/cdn/v1/fixture`, projectId: 'fixture' }, null, 2)}\n`)
  const mediaFile = join(project, '.contentrain', 'content', 'assets', 'media', 'data.json')
  const media = JSON.parse(readFileSync(mediaFile, 'utf8'))
  const moved = new Map()
  for (const entry of Object.values(media)) {
    if (!entry.url?.startsWith('/')) continue
    // Only the stand-in has the file now: a build that passes fetched it from there.
    rmSync(join(project, 'public', entry.url), { force: true })
    const url = `${studioUrl}/api/cdn/v1/fixture/media/${entry.url.replace(/^\/(?:media\/)?/, '')}`
    moved.set(entry.url, url)
    entry.url = url
  }
  writeFileSync(mediaFile, `${JSON.stringify(media, null, 2)}\n`)
  // Studio's media move rewrites the address wherever content holds it, bodies included: an image in a body points at
  // the same address as its library entry. So does a media field (an image or file field holds the address as its value).
  const contentDir = join(project, '.contentrain', 'content')
  for (const rel of readdirSync(contentDir, { recursive: true })) {
    const file = join(contentDir, String(rel))
    if (!file.endsWith('.json') || file === mediaFile) continue
    const before = readFileSync(file, 'utf8')
    let after = before
    for (const [from, to] of moved) {
      after = after.replaceAll(`src=\\"${from}\\"`, `src=\\"${to}\\"`)
      after = after.replaceAll(`"${from}"`, `"${to}"`)
    }
    if (after !== before) writeFileSync(file, after)
  }
}
process.on('exit', () => studioServer?.kill())

if (values.frozen && values['local-sdk']) throw new Error('--frozen tests the published packages; --local-sdk replaces one. Pick one.')
run('pnpm', ['install', values.frozen ? '--frozen-lockfile' : '--no-frozen-lockfile'])
if (fixtureDeps.length) run('pnpm', ['add', ...fixtureDeps.map(([name, range]) => `${name}@${range}`)])
if (values['local-sdk']) {
  run('pnpm', ['--filter', '@contentrain/types', '--filter', '@contentrain/query', 'build'], root)
  const packDir = mkdtempSync(join(tmpdir(), 'contentrain-query-'))
  run('pnpm', ['pack', '--pack-destination', packDir], join(root, 'packages', 'sdk', 'js'))
  const tarball = readdirSync(packDir).find(name => name.endsWith('.tgz'))
  if (!tarball) throw new Error('pnpm pack produced no tarball')
  run('pnpm', ['add', join(packDir, tarball)])
}

run('pnpm', ['exec', 'astro', 'check'])
run('pnpm', ['exec', 'knip'])
run('pnpm', ['run', 'build'])
run('node', ['scripts/check-dist.mjs'])

/** An attribute value as written in HTML, read back as text. */
const unescape = text => text.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

// Every indexable page has a meta description (the site's CI asserts Lighthouse SEO at 1): check-dist must catch a page
// without one, and no two list pages share one — a later page of a list says its number.
{
  const dist = join(project, 'dist')
  const pages = readdirSync(dist, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile() && entry.name.endsWith('.html'))
  const lists = new Map()
  const repeated = []
  for (const entry of pages) {
    const html = readFileSync(join(entry.parentPath, entry.name), 'utf8')
    if (!html.includes('data-cr-list') || /<meta name="robots" content="noindex/.test(html)) continue
    const description = /<meta name="description" content="([^"]*)"/.exec(html)?.[1]
    const file = join(entry.parentPath, entry.name).slice(dist.length + 1)
    if (description && lists.has(description)) repeated.push(`${file} and ${lists.get(description)}: ${description}`)
    else if (description) lists.set(description, file)
  }
  if (repeated.length) throw new Error(`List pages share a meta description:\n${repeated.join('\n')}`)
  // The source's own description is moved as it was written, whatever its length: only a composed one is held to 160
  // characters. Every description in the content longer than that must reach a built page whole.
  const built = new Set(pages.map(entry => /<meta name="description" content="([^"]*)"/.exec(readFileSync(join(entry.parentPath, entry.name), 'utf8'))?.[1]).filter(Boolean).map(unescape))
  const long = []
  const collect = value => {
    if (Array.isArray(value)) value.forEach(collect)
    else if (value && typeof value === 'object') {
      for (const [key, inner] of Object.entries(value)) {
        if (key === 'description' && typeof inner === 'string' && inner.trim().length > 160) long.push(inner)
        else collect(inner)
      }
    }
  }
  const contentDir = join(project, '.contentrain', 'content')
  if (existsSync(contentDir)) for (const entry of readdirSync(contentDir, { recursive: true, withFileTypes: true })) if (entry.isFile() && entry.name.endsWith('.json')) collect(JSON.parse(readFileSync(join(entry.parentPath, entry.name), 'utf8')))
  const cut = long.filter(text => !built.has(text))
  if (cut.length) throw new Error(`A source description longer than 160 characters did not reach its page whole:\n${cut.join('\n')}`)
  const described = pages.map(entry => join(entry.parentPath, entry.name)).find(path => /<meta name="description" content="[^"]+"/.test(readFileSync(path, 'utf8')) && !/content="noindex/.test(readFileSync(path, 'utf8')))
  if (!described) throw new Error('No built page has a meta description')
  const broken = mkdtempSync(join(tmpdir(), 'starter-dist-'))
  cpSync(dist, broken, { recursive: true })
  const target = join(broken, described.slice(dist.length + 1))
  writeFileSync(target, readFileSync(target, 'utf8').replace(/<meta name="description" content="[^"]*"\s*\/?>/, ''))
  let caught = false
  try { execFileSync('node', ['scripts/check-dist.mjs', broken], { cwd: project, stdio: 'pipe' }) }
  catch (error) { caught = String(error.stderr).includes(`${described.slice(dist.length + 1)}: no meta description`) }
  rmSync(broken, { recursive: true, force: true })
  if (!caught) throw new Error(`check-dist did not fail a page without a meta description (${described.slice(dist.length + 1)})`)
  console.log(`\n${lists.size} list page(s), each with a description no other list page has; ${long.length} source description(s) over 160 characters kept whole; check-dist fails a page without one`)
}

const absent = fixture.absentFromDist ?? []
if (absent.length) {
  const leaks = []
  for (const entry of readdirSync(join(project, 'dist'), { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !/\.(?:html|xml|txt|json)$/.test(entry.name)) continue
    const path = join(entry.parentPath, entry.name)
    const text = readFileSync(path, 'utf8')
    for (const needle of absent) if (text.includes(needle)) leaks.push(`${path.slice(project.length + 1)}: ${needle}`)
  }
  if (leaks.length) throw new Error(`Unpublished content reached dist:\n${leaks.join('\n')}`)
  console.log(`\nno unpublished content in dist (${absent.length} markers)`)
}

// `distFilesByMedia.<local|studio>` adds checks for one media mode: a Studio-bound build (`--media studio`) renders
// what a site waiting for Studio does not. `distFilesByMenu.<flyout|mega>` does the same for `--menu`.
const byMedia = fixture.distFilesByMedia?.[values.media] ?? {}
const byMenu = fixture.distFilesByMenu?.[values.menu] ?? {}
// Their needles are the root build's markup (`href="/about/"`): under `--base` the sweep below checks the addresses instead.
const fileChecks = base ? [] : [...new Set([...Object.keys(fixture.distFiles ?? {}), ...Object.keys(byMedia), ...Object.keys(byMenu)])].map(file => [file, {
  contains: [...(fixture.distFiles?.[file]?.contains ?? []), ...(byMedia[file]?.contains ?? []), ...(byMenu[file]?.contains ?? [])],
  excludes: [...(fixture.distFiles?.[file]?.excludes ?? []), ...(byMedia[file]?.excludes ?? []), ...(byMenu[file]?.excludes ?? [])],
  counts: { ...fixture.distFiles?.[file]?.counts, ...byMedia[file]?.counts, ...byMenu[file]?.counts },
}])
if (fileChecks.length) {
  const problems = []
  for (const [file, { contains = [], excludes = [], counts = {} }] of fileChecks) {
    const path = join(project, 'dist', file)
    if (!existsSync(path)) { problems.push(`${file}: not built`); continue }
    const text = readFileSync(path, 'utf8')
    for (const needle of contains) if (!text.includes(needle)) problems.push(`${file}: missing ${needle}`)
    for (const needle of excludes) if (text.includes(needle)) problems.push(`${file}: must not contain ${needle}`)
    // `counts`: a needle that must appear at least n times (a menu entry drawn in the flyout and in the drawer).
    for (const [needle, least] of Object.entries(counts)) {
      const found = text.split(needle).length - 1
      if (found < least) problems.push(`${file}: ${needle} appears ${found} time(s), expected at least ${least}`)
    }
  }
  if (problems.length) throw new Error(`Built files are not as expected:\n${problems.join('\n')}`)
  console.log(`\n${fileChecks.length} built file(s) as expected`)
}

const optimized = fixture.optimizedInDist ?? []
if (optimized.length) {
  const html = readdirSync(join(project, 'dist'), { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.html'))
    .map(entry => readFileSync(join(entry.parentPath, entry.name), 'utf8'))
    .join('\n')
  const missing = optimized.filter(name => !new RegExp(`<img[^>]+srcset="${base}/_astro/${name}[._][^"]+ \\d+w`).test(html))
  if (missing.length) throw new Error(`Not optimized in dist (no /_astro/ srcset): ${missing.join(', ')}`)
  console.log(`\n${optimized.length} image(s) optimized with a srcset (media: ${values.media})`)
}

// No page serves a raster file of public/ as it is: a body's `<img>` goes through the same optimizer as the kit's
// (webp srcset), size written. A remote image (Studio's media host) is the host's to serve, and a gif or a vector stays.
{
  const served = []
  const unsized = []
  for (const entry of readdirSync(join(project, 'dist'), { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.html')) continue
    for (const tag of readFileSync(join(entry.parentPath, entry.name), 'utf8').match(/<img\b[^>]*>/gi) ?? []) {
      const src = /\ssrc\s*=\s*(?:"(\/[^"/][^"]*\.(?:png|jpe?g))(?:[?#][^"]*)?"|'(\/[^'/][^']*\.(?:png|jpe?g))(?:[?#][^']*)?')/i.exec(tag)?.slice(1).find(Boolean)
      if (src) served.push(`${src} (${join(entry.parentPath, entry.name).replace(`${join(project, 'dist')}/`, '')})`)
      // An optimized body image is sized on both sides: a layout that shifts when it loads is half the fix.
      else if (new RegExp(`\\ssrcset\\s*=\\s*["']${base}/_astro/`, 'i').test(tag) && !(/\swidth\s*=\s*["']?\d/i.test(tag) && /\sheight\s*=\s*["']?\d/i.test(tag))) unsized.push(tag.slice(0, 120))
    }
  }
  if (served.length) throw new Error(`Raster originals served as they are:\n  ${[...new Set(served)].join('\n  ')}`)
  if (unsized.length) throw new Error(`Optimized images without width and height:\n  ${[...new Set(unsized)].join('\n  ')}`)
}

// `--base`: every address a page, the sitemap, the feed or the host's rules give on this site is inside the directory
// (check-dist checks that much on every delivered site), and leads to a file this build wrote.
if (base) {
  const dist = join(project, 'dist')
  const origin = 'https://example.com'
  const built = (path) => {
    let file
    try { file = decodeURIComponent(path.split(/[?#]/)[0]) } catch { return false }
    if (file !== base && !file.startsWith(`${base}/`)) return false
    file = file.slice(base.length) || '/'
    // The not-found page names itself `/404/` (its canonical); hosts serve it as `404.html`.
    if (file === '/404/') return existsSync(join(dist, '404.html'))
    return existsSync(join(dist, file)) && (!file.endsWith('/') || existsSync(join(dist, file, 'index.html')))
      || existsSync(join(dist, file, 'index.html'))
  }
  const own = (address) => {
    if (address.startsWith('/') && !address.startsWith('//')) return address
    try { const url = new URL(address); return url.origin === origin ? url.pathname + url.search : undefined } catch { return undefined }
  }
  const broken = new Set()
  let checked = 0
  const check = (where, address) => {
    const path = own(address)
    if (path === undefined) return
    checked++
    if (!built(path)) broken.add(`${where}: ${address}`)
  }
  for (const entry of readdirSync(dist, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue
    const path = join(entry.parentPath, entry.name)
    const where = path.slice(dist.length + 1)
    if (where.startsWith('pagefind/') || where.startsWith('_astro/')) continue
    if (entry.name.endsWith('.html')) {
      const html = readFileSync(path, 'utf8')
      // Only addresses a visitor or a crawler follows: links, sources, the canonical and Open Graph URLs.
      for (const [, address] of html.matchAll(/\s(?:href|src)="([^"#][^"]*)"/g)) check(where, unescape(address))
      for (const [, address] of html.matchAll(/<meta property="og:(?:url|image)" content="([^"]*)"/g)) check(where, unescape(address))
      for (const [, list] of html.matchAll(/\ssrcset="([^"]*)"/g)) for (const candidate of list.split(',')) check(where, candidate.trim().split(/\s+/)[0])
    }
    if (entry.name.endsWith('.xml')) for (const [, address] of readFileSync(path, 'utf8').matchAll(/<(?:loc|link)>([^<]+)<\/(?:loc|link)>/g)) check(where, unescape(address))
  }
  // The host's rules: an old address is inside the directory, and its target is a built page.
  const rules = readFileSync(join(dist, '_redirects'), 'utf8').split('\n').filter(line => line && !line.startsWith('#'))
  for (const line of rules) {
    const parts = line.split(/\s+/)
    const from = parts[0]
    const to = parts.at(-2)
    if (from !== base && !from.startsWith(`${base}/`)) broken.add(`_redirects: old address outside ${base}/: ${line}`)
    if (to.startsWith('/') && !to.includes(':splat') && !built(to)) broken.add(`_redirects: ${line}`)
  }
  if (broken.size) throw new Error(`Under base ${base}/, addresses that do not lead to a built file:\n  ${[...broken].slice(0, 40).join('\n  ')}${broken.size > 40 ? `\n  … ${broken.size - 40} more` : ''}`)
  if (checked === 0 || rules.length === 0 && values.fixture) throw new Error(`--base: nothing was checked (${checked} addresses, ${rules.length} host rules)`)
  console.log(`\nbase ${base}/: ${checked} address(es) in pages, sitemap and feed and ${rules.length} host rule(s), all inside the directory and built`)
}

studioServer?.kill()
console.log(`\nstarter gates passed${values.fixture ? ` (fixture: ${values.fixture})` : ''} — ${project}`)
if (!values.out) rmSync(project, { recursive: true, force: true })
