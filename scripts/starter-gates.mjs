#!/usr/bin/env node
// Runs templates/astro-starter's gates the way a delivered site runs them:
// copied out of the monorepo into a directory of its own, installed from its
// own package.json, then `astro check`, `knip`, `astro build` + Pagefind and
// `scripts/check-dist.mjs`.
//
//   node scripts/starter-gates.mjs                      the empty starter
//   node scripts/starter-gates.mjs --fixture wp-demo    with templates/fixtures/wp-demo laid over it
//   node scripts/starter-gates.mjs --local-sdk          @contentrain/query from this checkout, not npm
//   node scripts/starter-gates.mjs --out <dir>          keep the project there (default: a temp dir, removed on success)
//   node scripts/starter-gates.mjs --fixture wp-demo --media studio
//                                                       the fixture's media served as Contentrain Studio
//                                                       delivery URLs from a local stand-in, not from public/
//   node scripts/starter-gates.mjs --frozen             install exactly the starter's lockfile — the published
//                                                       packages a delivered site gets (no --local-sdk)
//
// --local-sdk tests the starter against the SDK at HEAD, so an SDK change
// that would break delivered sites fails here before it is released.
//
// A fixture is laid over the starter as files. Its `fixture.json` is not a
// site file: `dependencies` there are added after install, the way a
// migration adds what the kit components it copies need (embla-carousel for
// the slider). `optimizedInDist` names images that must reach dist as
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
  },
})

const starter = join(root, 'templates', 'astro-starter')
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
const fixtureDeps = Object.entries(fixture.dependencies ?? {})

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
  process.env.CONTENTRAIN_STUDIO_URL = `http://127.0.0.1:${port}`
  process.env.CONTENTRAIN_STUDIO_PROJECT = 'fixture'
  const mediaFile = join(project, '.contentrain', 'content', 'assets', 'media', 'data.json')
  const media = JSON.parse(readFileSync(mediaFile, 'utf8'))
  for (const entry of Object.values(media)) {
    if (!entry.url?.startsWith('/')) continue
    // Only the stand-in has the file now: a build that passes fetched it from there.
    rmSync(join(project, 'public', entry.url), { force: true })
    entry.url = `${process.env.CONTENTRAIN_STUDIO_URL}/api/cdn/v1/fixture/media/${entry.url.replace(/^\/(?:media\/)?/, '')}`
  }
  writeFileSync(mediaFile, `${JSON.stringify(media, null, 2)}\n`)
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

const optimized = fixture.optimizedInDist ?? []
if (optimized.length) {
  const html = readdirSync(join(project, 'dist'), { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.html'))
    .map(entry => readFileSync(join(entry.parentPath, entry.name), 'utf8'))
    .join('\n')
  const missing = optimized.filter(name => !new RegExp(`<img[^>]+srcset="/_astro/${name}[._][^"]+ \\d+w`).test(html))
  if (missing.length) throw new Error(`Not optimized in dist (no /_astro/ srcset): ${missing.join(', ')}`)
  console.log(`\n${optimized.length} image(s) optimized with a srcset (media: ${values.media})`)
}

console.log(`\nstarter gates passed${values.fixture ? ` (fixture: ${values.fixture})` : ''} — ${project}`)
if (!values.out) rmSync(project, { recursive: true, force: true })
