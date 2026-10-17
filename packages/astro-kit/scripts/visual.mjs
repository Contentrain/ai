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
// 4. Checks every fixture's heading outline: it opens at the component's own
//    level (`level` or `headingLevel`, else h2) or above, and never skips one
//    on the way down (h2 → h4), with or without a section heading.
//
//   node scripts/visual.mjs                 compare (a missing baseline is written and reported)
//   node scripts/visual.mjs --update        rewrite every baseline
//   node scripts/visual.mjs --only hero     one component (or several: --only hero,faq — one install, one astro check)
//   node scripts/visual.mjs --out <dir>     keep the site there
//   node scripts/visual.mjs --local-sdk     @contentrain/query and @contentrain/types from this checkout (scripts/local-sdk.mjs)
//   node scripts/visual.mjs --ci            a missing baseline fails (its shot is kept as .actual.png) instead of being written

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import pixelmatch from 'pixelmatch'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { installLocalSdk } from '../../../scripts/local-sdk.mjs'

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(kitRoot, '..', '..')
const { values } = parseArgs({
  options: {
    update: { type: 'boolean', default: false },
    only: { type: 'string' },
    out: { type: 'string' },
    'local-sdk': { type: 'boolean', default: false },
    ci: { type: 'boolean', default: false },
  },
})

const WIDTHS = [390, 768, 1280]
/** The props that break a text into lines, the field they break, and where it is drawn (a quote: the first item's). */
const LINED = [['headingLines', 'heading', 'h1, h2'], ['leadLines', 'lead', '[data-kit-text]'], ['quoteLines', 'quote', 'blockquote p']]

/** Share of differing pixels tolerated before a fixture fails. */
const MAX_DIFF_RATIO = 0.002
const baselineDir = join(kitRoot, 'visual', process.platform)
const catalog = JSON.parse(readFileSync(join(kitRoot, 'catalog.json'), 'utf8'))
const only = values.only?.split(',').map(id => id.trim()).filter(Boolean)
const components = catalog.components.filter(c => !only || only.includes(c.id))
if (components.length === 0 || (only && components.length !== only.length)) throw new Error(`no component "${values.only}"`)

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

type Fixture = { name: string, frame?: 'dark' | 'tall' | 'narrow' | 'overlay', theme?: Record<string, string>, props: ComponentProps<typeof Component> }
const fixtures = ${fixtures.trim()} satisfies Fixture[]
---
<BaseLayout title="Kit: ${pascal(c.id)}" noindex>
  {(fixtures as Fixture[]).map(fixture => (
    <div data-fixture={fixture.name} class:list={['relative', fixture.frame === 'dark' && 'bg-ink pb-40', fixture.frame === 'tall' && 'min-h-[40rem]', fixture.frame === 'overlay' && 'min-h-64 [transform:translateZ(0)]']} style={fixture.theme ? Object.entries(fixture.theme).map(([name, value]) => \`\${name}: \${value}\`).join('; ') : undefined}>
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
if (values['local-sdk']) installLocalSdk({ repoRoot, site, run })
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

const fixturesOf = new Map(components.map(c => [c.id, new Map(JSON.parse(readFileSync(join(kitRoot, 'components', c.id, 'fixtures.json'), 'utf8')).map(f => [f.name, f.props]))]))
// A fixture's `theme`: custom properties set around it, as a site's theme or a design direction would set them.
const themeOf = new Map(components.map(c => [c.id, new Map(JSON.parse(readFileSync(join(kitRoot, 'components', c.id, 'fixtures.json'), 'utf8')).map(f => [f.name, f.theme]))]))
const hooks = []
const outline = []
const menus = []
const carousels = []
const lightboxes = []
const embeds = []
const ids = []
/** Every real href of a menu tree (a Nav or Header `items` prop), at any depth. */
const menuHrefs = items => (items ?? []).flatMap(item => (item.href && item.href !== '#' ? [item.href] : []).concat(menuHrefs(item.children)))
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
      // Every fixture of a component on one page, as two instances on a site page: no id twice (a label, tab or lightbox
      // would point into the other instance), and each instance's first lightbox button opens its own image.
      if (width === WIDTHS[0]) {
        const twice = await page.evaluate(() => {
          const seen = new Map()
          for (const el of document.querySelectorAll('[id]')) seen.set(el.id, (seen.get(el.id) ?? 0) + 1)
          return [...seen].filter(([, n]) => n > 1).map(([id, n]) => `${id} ×${n}`)
        })
        if (twice.length) ids.push(`${c.id}: ${twice.join(', ')}`)
        for (const element of await page.locator('[data-fixture]').all()) {
          const opener = element.locator('button[popovertarget]:not([popovertargetaction="hide"])').first()
          if (!await opener.count()) continue
          await opener.click()
          const own = await element.evaluate(el => !!el.querySelector(':popover-open'))
          if (!own) ids.push(`${c.id}/${await element.getAttribute('data-fixture')}: its first lightbox button opens another instance's popover`)
          await page.keyboard.press('Escape')
          // Closing hands focus back to the button: drop it, so the shot has no focus ring.
          await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined))
        }
      }
      for (const element of await page.locator('[data-fixture]').all()) {
        const name = await element.getAttribute('data-fixture')
        if (width === WIDTHS[0]) {
          const levels = await element.evaluate(el => [...el.querySelectorAll('h1, h2, h3, h4, h5, h6')].map(h => Number(h.tagName[1])))
          const props = fixturesOf.get(c.id).get(name) ?? {}
          const opens = Number(props.level ?? props.headingLevel ?? 2)
          const skip = levels.findIndex((level, i) => level > (i === 0 ? opens : levels[i - 1] + 1))
          if (skip >= 0) outline.push(`${c.id}/${name}: h${levels.join(' h')} (${skip === 0 ? `opens below h${opens}` : `h${levels[skip - 1]} → h${levels[skip]}`})`)
        }
        const lined = fixturesOf.get(c.id).get(name)
        // Text broken into lines: one block per line (`data-kit-line`) inside the one element, still read as one sentence.
        for (const [axis, field, selector] of LINED) {
          if (width !== WIDTHS[0] || lined?.[axis] !== 'lines') continue
          const text = field === 'quote' ? lined.items?.[0]?.quote : lined[field]
          const want = String(text).split('\n').map(line => line.trim()).filter(Boolean)
          const got = await element.evaluate((el, sel) => { const h = el.querySelector(sel); return { lines: [...(h?.querySelectorAll('[data-kit-line]') ?? [])].map(l => l.textContent), text: h?.textContent?.replace(/\s+/g, ' ').trim() } }, selector)
          if (JSON.stringify(got.lines) !== JSON.stringify(want) || got.text !== want.join(' ')) outline.push(`${c.id}/${name}: ${field} lines ${JSON.stringify(got)} (expected ${JSON.stringify(want)})`)
        }
        if (width === WIDTHS[0] && themeOf.get(c.id).get(name)) {
          // The heading hooks are read: the heading's face and track are the ones the theme set, not the body's.
          const got = await element.evaluate(el => {
            const h = el.querySelector('h1, h2, h3')
            // At the heading's own size: a track in em is a length of the size it is drawn at.
            const probe = Object.assign(document.createElement('span'), { style: `font-size: ${h ? getComputedStyle(h).fontSize : '1rem'}; font-family: var(--font-heading); letter-spacing: var(--tracking-heading)` })
            el.append(probe)
            const want = { font: getComputedStyle(probe).fontFamily, track: getComputedStyle(probe).letterSpacing }
            probe.remove()
            return { font: h && getComputedStyle(h).fontFamily, track: h && getComputedStyle(h).letterSpacing, want, body: getComputedStyle(document.body).fontFamily }
          })
          if (got.font !== got.want.font || got.track !== got.want.track || got.font === got.body) hooks.push(`${c.id}/${name}: heading ${JSON.stringify(got)}`)
        }
        if (width === WIDTHS[0] && (c.id === 'nav' || c.id === 'header')) {
          // A menu keeps every level: each real href is a link in the wide menu and again in the narrow one, and a
          // group with no link is not drawn as <a href="#">.
          const props = fixturesOf.get(c.id).get(name) ?? {}
          const counts = await element.evaluate(el => [...el.querySelectorAll('a[href]')].map(a => a.getAttribute('href')))
          for (const href of menuHrefs(props.items)) if (counts.filter(h => h === href).length < 2) menus.push(`${c.id}/${name}: ${href} is drawn ${counts.filter(h => h === href).length} time(s), expected the wide and the narrow menu`)
          if (counts.includes('#')) menus.push(`${c.id}/${name}: a group with no link is drawn as <a href="#">`)
        }
        const shot = PNG.sync.read(await element.screenshot({ animations: 'disabled' }))
        const file = join(baselineDir, c.id, `${name}-${width}.png`)
        if (values.ci && !values.update && !existsSync(file)) {
          // In CI a missing baseline is a failure: one written there would pass whatever was drawn.
          mkdirSync(dirname(file), { recursive: true })
          writeFileSync(file.replace(/\.png$/, '.actual.png'), PNG.sync.write(shot))
          failures.push(`${c.id}/${name} @${width}: no ${process.platform} baseline (its shot is ${relative(kitRoot, file.replace(/\.png$/, '.actual.png'))})`)
          continue
        }
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
  // The menus work with no script: with JavaScript off, focusing a parent's button (Tab) or hovering its item opens the
  // panel and the deepest links in it are visible. The script only adds aria-expanded, Escape and outside clicks.
  if (components.some(c => c.id === 'nav')) {
    const bare = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 900 } })
    const page = await bare.newPage()
    await page.goto(`${origin}/kit/nav/`, { waitUntil: 'load' })
    for (const [name, props] of fixturesOf.get('nav')) {
      const deepest = (items => { let found; const walk = (list, depth) => { for (const item of list ?? []) { if (depth >= 3 && item.href && item.href !== '#') found ??= item.href; walk(item.children, depth + 1) } }; walk(items, 1); return found })(props.items)
      if (!deepest) continue
      const root = page.locator(`[data-fixture="${name}"]`)
      const item = root.locator('li.group').filter({ has: page.locator(`a[href="${deepest}"]`) }).first()
      const link = item.locator(`a[href="${deepest}"]`).first()
      await item.hover()
      if (!await link.isVisible()) menus.push(`nav/${name}: with JavaScript off, hovering the item does not show ${deepest}`)
      await page.mouse.move(0, 0)
      await item.locator('button[data-kit-sub]').first().focus()
      if (!await link.isVisible()) menus.push(`nav/${name}: with JavaScript off, focusing the item's button does not show ${deepest}`)
      // Drop focus so this fixture's open panel does not cover the next one.
      await page.mouse.click(1, 1)
    }
    await bare.close()
  }
  // A carousel set up while its page is hidden (a background tab opened with ctrl/cmd-click: no layout, visibilityState
  // "hidden") pages once the page is shown: it draws a dot per snap and "next" moves the selected one. The kit page loads
  // with the document hidden and not laid out, then is shown the way a tab brought to the front is.
  if (components.some(c => c.id === 'slider')) {
    const page = await browser.newPage({ viewport: { width: 900, height: 900 }, reducedMotion: 'reduce' })
    await page.addInitScript(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__shown ? 'visible' : 'hidden' })
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => !window.__shown })
    })
    await page.route(`${origin}/kit/slider/`, async (route) => {
      const response = await route.fetch()
      await route.fulfill({ response, body: (await response.text()).replace('<head>', '<head><style id="hidden-tab">html{display:none!important}</style>') })
    })
    await page.goto(`${origin}/kit/slider/`, { waitUntil: 'networkidle' })
    await page.waitForFunction(() => [...document.querySelectorAll('[data-kit-slider]')].every(el => el.hasAttribute('data-ready')))
    await page.evaluate(() => {
      document.getElementById('hidden-tab').remove()
      window.__shown = true
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 300)))))
    for (const element of await page.locator('[data-fixture]').all()) {
      const name = await element.getAttribute('data-fixture')
      const state = () => element.evaluate((el) => {
        const viewport = el.querySelector('[data-viewport]')
        const track = el.querySelector('[data-container]')
        const dots = [...el.querySelectorAll('[data-dots] button')]
        return { overflows: track.scrollWidth > viewport.clientWidth + 2, dots: dots.length, selected: dots.findIndex(dot => dot.getAttribute('aria-current') === 'true'), next: el.querySelector('[data-next]')?.disabled }
      })
      const before = await state()
      if (!before.overflows) continue
      if (before.dots < 2 || before.next) {
        carousels.push(`slider/${name}: shown after it was set up hidden, it draws ${before.dots} dot(s) and "next" is ${before.next ? 'disabled' : 'enabled'}`)
        continue
      }
      await element.evaluate(el => el.querySelector('[data-next]').click())
      await page.evaluate(() => new Promise(done => setTimeout(done, 300)))
      const after = await state()
      if (after.selected === before.selected) carousels.push(`slider/${name}: shown after it was set up hidden, "next" does not move the carousel (dot ${before.selected + 1} of ${before.dots} stays selected)`)
    }
    await page.close()
  }
  // A video from another site loads nothing until the reader asks: no request to its host while the page loads and is
  // scrolled through, then, on a click or Enter on a poster, its player (youtube-nocookie, Vimeo with dnt) in the poster's
  // own box, focused. The providers' hosts are answered here, never reached.
  for (const kitId of ['slider', 'behavior'].filter(want => components.some(c => c.id === want))) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const asked = []
    await page.route(url => /(?:^|\.)(?:(?:youtube|youtube-nocookie|ytimg|googlevideo|vimeo|vimeocdn)\.com|youtu\.be)$/.test(url.hostname), (route) => {
      asked.push(route.request().url())
      return route.fulfill({ status: 200, contentType: 'text/html', body: '' })
    })
    await page.goto(`${origin}/kit/${kitId}/`, { waitUntil: 'networkidle' })
    await page.evaluate(() => new Promise((done) => { window.scrollTo(0, document.body.scrollHeight); setTimeout(done, 300) }))
    await page.evaluate(() => window.scrollTo(0, 0))
    if (asked.length) embeds.push(`${kitId}: ${asked.length} request(s) to a video host before any click (${asked[0]})`)
    const links = await page.$$('[data-slide-player] a[data-embed-src], .cr-behavior a[data-cr-video]')
    if (!links.length) embeds.push(`${kitId}: no video poster on the kit page`)
    for (const [i, link] of links.entries()) {
      const holder = await link.evaluateHandle(el => el.parentElement)
      await link.scrollIntoViewIfNeeded()
      const before = await link.boundingBox()
      if (i % 2) { await link.focus(); await page.keyboard.press('Enter') }
      else await link.click()
      const frame = await holder.$('iframe')
      if (!frame) { embeds.push(`${kitId} poster ${i + 1}: ${i % 2 ? 'Enter' : 'a click'} does not start the player`); continue }
      const after = await frame.boundingBox()
      const { src, focused } = await frame.evaluate(f => ({ src: f.src, focused: document.activeElement === f }))
      const host = new URL(src).hostname
      if (host !== 'www.youtube-nocookie.com' && !(host === 'player.vimeo.com' && new URL(src).searchParams.get('dnt') === '1')) embeds.push(`${kitId} poster ${i + 1}: the player loads ${src}`)
      if (!focused) embeds.push(`${kitId} poster ${i + 1}: the player does not take focus`)
      if (!before || !after || Math.abs(before.width - after.width) > 1 || Math.abs(before.height - after.height) > 1) embeds.push(`${kitId} poster ${i + 1}: the player is ${after?.width}×${after?.height}, the poster was ${before?.width}×${before?.height}`)
    }
    await page.close()
  }
  // A gallery's lightbox in a real browser: each tile links to its large file (what a click opens with JavaScript off),
  // a click opens the modal viewer on that file, → steps to the next, and Escape closes it with focus back on the tile.
  if (components.some(c => c.id === 'gallery')) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' })
    await page.goto(`${origin}/kit/gallery/`, { waitUntil: 'networkidle' })
    for (const [name, props] of fixturesOf.get('gallery')) {
      if (props.open !== 'lightbox') continue
      const root = page.locator(`[data-fixture="${name}"]`)
      const tiles = root.locator('a[data-kit-lightbox-item]')
      const large = props.items.map(item => (item.full ?? item.image).src)
      const hrefs = await tiles.evaluateAll(links => links.map(link => link.getAttribute('href')))
      if (hrefs.join(' ') !== large.join(' ')) {
        lightboxes.push(`gallery/${name}: the tiles link to ${hrefs.join(', ')}, not their large files ${large.join(', ')}`)
        continue
      }
      const state = () => root.locator('dialog').evaluate(async (dialog) => {
        const image = dialog.querySelector('[data-kit-lightbox-image]')
        if (image && !image.complete) await new Promise(done => image.addEventListener('load', done, { once: true }))
        return { modal: dialog.matches(':modal'), src: image?.getAttribute('src') ?? '', drawn: (image?.naturalWidth ?? 0) > 0, count: dialog.querySelector('[data-kit-lightbox-count]')?.textContent ?? '' }
      })
      await tiles.first().click()
      const opened = await state()
      if (!opened.modal || !opened.src.endsWith(large[0]) || !opened.drawn) lightboxes.push(`gallery/${name}: a click on the first tile ${opened.modal ? `shows ${opened.src || 'no image'}${opened.drawn ? '' : ' (not drawn)'}` : 'does not open the modal viewer'}`)
      await page.keyboard.press('ArrowRight')
      const stepped = await state()
      if (large.length > 1 && (!stepped.src.endsWith(large[1]) || stepped.count !== `2 of ${large.length}`)) lightboxes.push(`gallery/${name}: → shows ${stepped.src} ("${stepped.count}"), not the second image`)
      await page.keyboard.press('Escape')
      const back = await root.evaluate(el => ({ open: !!el.querySelector('dialog[open]'), focused: document.activeElement === el.querySelector('a[data-kit-lightbox-item]') }))
      if (back.open || !back.focused) lightboxes.push(`gallery/${name}: Escape ${back.open ? 'leaves the viewer open' : 'does not hand focus back to the tile'}`)
    }
    await page.close()
  }
} finally {
  await browser.close()
  server.close()
}

if (outline.length) console.error(`visual: ${outline.length} fixture(s) skip a heading level:\n${outline.map(line => `  ✗ ${line}`).join('\n')}`)
if (menus.length) console.error(`visual: ${menus.length} menu level(s) lost:\n${menus.map(line => `  ✗ ${line}`).join('\n')}`)
if (carousels.length) console.error(`visual: ${carousels.length} carousel(s) not paging:\n${carousels.map(line => `  ✗ ${line}`).join('\n')}`)
if (embeds.length) console.error(`visual: ${embeds.length} embedded video(s) wrong:\n${embeds.map(line => `  ✗ ${line}`).join('\n')}`)
if (lightboxes.length) console.error(`visual: ${lightboxes.length} lightbox(es) wrong:\n${lightboxes.map(line => `  ✗ ${line}`).join('\n')}`)
if (ids.length) console.error(`visual: ${ids.length} page(s) with shared ids:\n${ids.map(line => `  ✗ ${line}`).join('\n')}`)
if (written.length) console.log(`visual: wrote ${written.length} baseline(s) under ${baselineDir}`)
if (failures.length) {
  console.error(`visual: ${failures.length} fixture(s) changed:\n${failures.map(line => `  ✗ ${line}`).join('\n')}`)
  process.exit(1)
}
if (hooks.length) console.error(`visual: ${hooks.length} fixture(s) whose heading ignores the theme's heading face or track:\n${hooks.map(line => `  ✗ ${line}`).join('\n')}`)
if (outline.length || menus.length || carousels.length || embeds.length || lightboxes.length || ids.length || hooks.length) process.exit(1)
console.log(`visual: ${components.length} component(s) × ${WIDTHS.length} widths match`)
if (!values.out) rmSync(site, { recursive: true, force: true })
