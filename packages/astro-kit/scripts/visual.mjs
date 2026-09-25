#!/usr/bin/env node
// Visual regression for the kit, in the site it is made for.
//
// 1. Copies templates/astro-starter out, copies every kit component into it
//    and writes one page per component, /kit/<id>/, rendering each entry of
//    its fixtures.json. Fixtures are inlined with `satisfies` against the
//    component's props, so `astro check` type-checks them.
// 2. Installs, runs `astro check` and builds.
// 3. Screenshots every fixture at 390, 768 and 1280 px and compares it with
//    visual/<platform>/<id>/<fixture>-<width>.png (pixelmatch). Baselines are
//    per platform because font rendering differs between macOS and Linux.
//
//   node scripts/visual.mjs                 compare (a missing baseline is written and reported)
//   node scripts/visual.mjs --update        rewrite every baseline
//   node scripts/visual.mjs --only hero     one component
//   node scripts/visual.mjs --out <dir>     keep the site there
//   node scripts/visual.mjs --local-sdk     @contentrain/query from this checkout

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import pixelmatch from 'pixelmatch'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(kitRoot, '..', '..')
const { values } = parseArgs({
  options: {
    update: { type: 'boolean', default: false },
    only: { type: 'string' },
    out: { type: 'string' },
    'local-sdk': { type: 'boolean', default: false },
  },
})

const WIDTHS = [390, 768, 1280]
/** Share of differing pixels tolerated before a fixture fails. */
const MAX_DIFF_RATIO = 0.002
const baselineDir = join(kitRoot, 'visual', process.platform)
const catalog = JSON.parse(readFileSync(join(kitRoot, 'catalog.json'), 'utf8'))
const components = catalog.components.filter(c => !values.only || c.id === values.only)
if (components.length === 0) throw new Error(`no component "${values.only}"`)

const site = values.out ? resolve(values.out) : mkdtempSync(join(tmpdir(), 'astro-kit-visual-'))
const run = (command, args, cwd = site) => execFileSync(command, args, { cwd, stdio: 'inherit', env: { ...process.env, CI: 'true' } })

// ── 1. the site ──
const starter = join(repoRoot, 'templates', 'astro-starter')
rmSync(site, { recursive: true, force: true })
cpSync(starter, site, { recursive: true, filter: source => !/\/(?:node_modules|dist|\.astro)(?:\/|$)/.test(source.slice(starter.length)) })
cpSync(join(kitRoot, 'components'), join(site, 'src', 'components', 'kit'), {
  recursive: true,
  filter: source => !/\/(?:meta|fixtures)\.json$/.test(source),
})
cpSync(join(kitRoot, 'visual', 'assets'), join(site, 'public', 'kit-fixtures'), { recursive: true })

const pascal = id => id.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join('')
mkdirSync(join(site, 'src', 'pages', 'kit'), { recursive: true })
for (const c of catalog.components) {
  const main = c.files.find(file => file.endsWith('.astro'))
  const fixtures = readFileSync(join(kitRoot, 'components', c.id, 'fixtures.json'), 'utf8')
  writeFileSync(join(site, 'src', 'pages', 'kit', `${c.id}.astro`), `---
import type { ComponentProps } from 'astro/types'
import Component from '../../components/kit/${c.id}/${main}'
import BaseLayout from '../../layouts/BaseLayout.astro'

type Fixture = { name: string, frame?: 'dark' | 'tall' | 'narrow', props: ComponentProps<typeof Component> }
const fixtures = ${fixtures.trim()} satisfies Fixture[]
---
<BaseLayout title="Kit: ${pascal(c.id)}" noindex>
  {(fixtures as Fixture[]).map(fixture => (
    <div data-fixture={fixture.name} class:list={['relative', fixture.frame === 'dark' && 'bg-ink pb-40', fixture.frame === 'tall' && 'min-h-[40rem]']}>
      {fixture.frame === 'narrow' ? <div class="container-page py-6"><div class="max-w-sm"><Component {...fixture.props} /></div></div> : <Component {...fixture.props} />}
    </div>
  ))}
</BaseLayout>
`)
}

// ── 2. install, check, build ──
const dependencies = Object.entries({ ...catalog.dependencies, ...Object.assign({}, ...catalog.components.map(c => c.dependencies)) }).map(([name, range]) => `${name}@${range}`)
run('pnpm', ['install', '--no-frozen-lockfile'])
run('pnpm', ['add', ...dependencies])
if (values['local-sdk']) {
  run('pnpm', ['--filter', '@contentrain/types', '--filter', '@contentrain/query', 'build'], repoRoot)
  const packDir = mkdtempSync(join(tmpdir(), 'contentrain-query-'))
  run('pnpm', ['pack', '--pack-destination', packDir], join(repoRoot, 'packages', 'sdk', 'js'))
  run('pnpm', ['add', join(packDir, readdirSync(packDir).find(name => name.endsWith('.tgz')))])
}
run('pnpm', ['exec', 'astro', 'check'])
run('pnpm', ['exec', 'astro', 'build'])

// ── 3. screenshots ──
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.xml': 'application/xml', '.json': 'application/json' }
const dist = join(site, 'dist')
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  let file = join(dist, path)
  if (path.endsWith('/')) file = join(file, 'index.html')
  if (!existsSync(file)) {
    res.writeHead(404).end()
    return
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file))
})
await new Promise(done => server.listen(0, done))
const origin = `http://localhost:${server.address().port}`

const browser = await chromium.launch(process.platform === 'darwin' ? { channel: 'chrome' } : {})
const failures = []
const written = []
try {
  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' })
    for (const c of components) {
      await page.goto(`${origin}/kit/${c.id}/`, { waitUntil: 'networkidle' })
      // Settle before shooting: fonts loaded, scripted components mounted
      // (Embla marks its root data-ready; a looping carousel repositions its
      // slides right after), then two frames and a short pause for layout.
      await page.evaluate(() => document.fonts.ready)
      await page.waitForFunction(() => [...document.querySelectorAll('[data-kit-slider]')].every(el => el.hasAttribute('data-ready')))
      await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 300)))))
      for (const element of await page.locator('[data-fixture]').all()) {
        const name = await element.getAttribute('data-fixture')
        const shot = PNG.sync.read(await element.screenshot({ animations: 'disabled' }))
        const file = join(baselineDir, c.id, `${name}-${width}.png`)
        if (values.update || !existsSync(file)) {
          mkdirSync(dirname(file), { recursive: true })
          writeFileSync(file, PNG.sync.write(shot))
          written.push(file)
          continue
        }
        const base = PNG.sync.read(readFileSync(file))
        if (base.width !== shot.width || base.height !== shot.height) {
          failures.push(`${c.id}/${name} @${width}: size ${shot.width}×${shot.height}, baseline ${base.width}×${base.height}`)
          writeFileSync(file.replace(/\.png$/, '.actual.png'), PNG.sync.write(shot))
          continue
        }
        const diff = new PNG({ width: base.width, height: base.height })
        const changed = pixelmatch(base.data, shot.data, diff.data, base.width, base.height, { threshold: 0.1 })
        if (changed / (base.width * base.height) > MAX_DIFF_RATIO) {
          failures.push(`${c.id}/${name} @${width}: ${changed} px differ`)
          writeFileSync(file.replace(/\.png$/, '.actual.png'), PNG.sync.write(shot))
          writeFileSync(file.replace(/\.png$/, '.diff.png'), PNG.sync.write(diff))
        }
      }
    }
    await page.close()
  }
} finally {
  await browser.close()
  server.close()
}

if (written.length) console.log(`visual: wrote ${written.length} baseline(s) under ${baselineDir}`)
if (failures.length) {
  console.error(`visual: ${failures.length} fixture(s) changed:\n${failures.map(line => `  ✗ ${line}`).join('\n')}`)
  process.exit(1)
}
console.log(`visual: ${components.length} component(s) × ${WIDTHS.length} widths match`)
if (!values.out) rmSync(site, { recursive: true, force: true })
