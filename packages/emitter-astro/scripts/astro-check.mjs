// `astro check` over an emitted site that exercises every kind of page and
// endpoint the emitter writes: posts, pages, a nested category archive with its
// feed, a tag archive, an author profile, a plain list, a static page, the feed,
// llms.txt, redirects and the image pass — with entries the build leaves out
// (a draft, one in review, a published post scheduled for later, published
// posts that are password-protected or private) beside a published one
// scheduled in the past and a live page that links to the draft and the
// password-protected post.
//
// The unit suite asserts the emitted strings; this checks what the build checks
// first — the types of the emitted .astro and .ts files against Astro's own.
// 0.16.0 shipped an archive page whose `seo` object did not type-check, and every
// site with a category route failed to build; the unit suite could not see it.
//
// Run after `pnpm build` (it imports dist/): `pnpm --filter @contentrain/emitter-astro test:astro`.

import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { MIGRATION_CONTRACT_VERSION } from '@contentrain/types'
import { emitAstroProject } from '../dist/index.mjs'

const q = (id) => ({ id, source: 'posts', order: { by: 'date', direction: 'desc' }, per_page: 10, pagination: 'numbered' })
const head = '<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite","@id":"https://example.com/#website","publisher":{"@id":"https://example.com/#organization"}},{"@type":"Organization","@id":"https://example.com/#organization","name":"Example"}]}</script>'
  + '<link rel="alternate" type="application/rss+xml" href="https://example.com/feed/">'

function emit(options) {
  return emitAstroProject({
    ir: {
      version: MIGRATION_CONTRACT_VERSION,
      site: { url: 'https://example.com', title: 'Example', locales: ['tr-TR'] },
      routes: [
        { id: 'r-post', pattern: '/:year/:slug', kind: 'single', family: 'f' },
        { id: 'r-page', pattern: '/:slug*', kind: 'page', family: 'f', collection: 'pages' },
        { id: 'r-cat', pattern: '/kategori/:term*', kind: 'archive', family: 'f', query: 'q-cat' },
        { id: 'r-cat-paged', pattern: '/kategori/:term*/page/:page', kind: 'archive', family: 'f', query: 'q-cat-paged' },
        { id: 'r-tag', pattern: '/etiket/:tag', kind: 'archive', family: 'f', query: 'q-tag' },
        { id: 'r-author', pattern: '/yazar/:author', kind: 'archive', family: 'f', query: 'q-author' },
        { id: 'r-news', pattern: '/haberler', kind: 'archive', family: 'f', query: 'q-news' },
        { id: 'r-static', pattern: '/iletisim', kind: 'page', family: 'f', title: 'İletişim' },
      ],
      families: [{ id: 'f', kind: 'single', chrome: [
        { id: 'head', position: 'head', html: head },
        { id: 'body', position: 'body', html: '<main><!--@@body@@--></main>' },
      ], css: { strategy: 'localcss' } }],
      queries: ['q-cat', 'q-cat-paged', 'q-tag', 'q-author', 'q-news'].map(q),
      css_default: 'purge_set',
    },
    content: {
      posts: [{
        slug: 'merhaba', title: 'Merhaba', body: '<p>x</p>', params: { year: '2025' },
        published_at: '2025-01-01T00:00:00Z', modified_at: '2025-02-01T00:00:00Z', author: 'Ada', author_url: '/yazar/ada/',
        image: '/media/a.jpg', image_meta: { width: 1200, height: 630, type: 'image/jpeg' },
        seo_title: 'Merhaba – Example', open_graph: { title: 'Paylaş' }, twitter: { card: 'summary' },
        breadcrumbs: [{ name: 'Ana sayfa', path: '/' }], noindex: false,
        status: 'published',
      },
      { slug: 'gecmis', title: 'Geçmiş', body: '<p><a href="/2025/taslak/">taslak</a> <a href="/2025/sifreli/">şifreli</a></p>', params: { year: '2025' }, status: 'published', publish_at: '2020-01-01T00:00:00Z' },
      { slug: 'sifreli', title: 'Şifreli', body: '<p>yalnız üyelere</p>', params: { year: '2025' }, status: 'published', visibility: 'password' },
      { slug: 'ozel', title: 'Özel', body: '<p>x</p>', params: { year: '2025' }, status: 'published', visibility: 'private' },
      { slug: 'gelecek', title: 'Gelecek', body: '<p>x</p>', params: { year: '2025' }, status: 'published', publish_at: '2999-01-01T00:00:00Z' },
      { slug: 'taslak', title: 'Taslak', body: '<p>x</p>', params: { year: '2025' }, status: 'draft' },
      { slug: 'incelemede', title: 'İncelemede', body: '<p>x</p>', params: { year: '2025' }, status: 'in_review' }],
      collections: { pages: [{ slug: 'hakkimizda/ekip', title: 'Ekip', body: '', modified_at: '2025-03-01T00:00:00Z', noindex: true }] },
      queries: {
        'q-cat': [{ params: { term: 'haberler/yerel' }, title: 'Yerel', items: [
          { slug: 'gecmis', title: 'Geçmiş', body: '', params: { year: '2025' }, publish_at: '2020-01-01T00:00:00Z' },
          { slug: 'gelecek', title: 'Gelecek', body: '', params: { year: '2025' }, publish_at: '2999-01-01T00:00:00Z' },
          { slug: 'taslak', title: 'Taslak', body: '', params: { year: '2025' }, status: 'draft' },
          { slug: 'sifreli', title: 'Şifreli', body: '', params: { year: '2025' }, visibility: 'password' },
        ] }],
        'q-cat-paged': [{ params: { term: 'haberler/yerel', page: '2' }, items: [] }],
        'q-tag': [{ params: { tag: 'x' }, items: [], open_graph: { title: 'X' } }],
        'q-author': [{ params: { author: 'ada' }, items: [], profile: { name: 'Ada', same_as: ['https://x.example/ada'] } }],
        'q-news': [{ params: {}, items: [] }],
      },
    },
    redirects: [{ from: '/eski/', to: '/2025/merhaba/' }, { from: '/eski-taslak/', to: '/2025/taslak/' }],
    hostRedirects: [{ from: '/2025/merhaba/ek/', to: '/2025/merhaba/' }],
    options: { tailwind: false, siteDescription: 'Bir site.', ...options },
  })
}

/**
 * Emit into a fresh directory and run `astro check` there, as a migrated site
 * runs it: dependencies from the emitted package.json, installed with npm.
 * `modules` is a node_modules to reuse (the second site needs the same set).
 */
async function check(label, options, modules) {
  const dir = await mkdtemp(join(tmpdir(), `emitter-astro-check-${label}-`))
  try {
    const { files } = emit(options)
    for (const [path, content] of Object.entries(files)) {
      await mkdir(dirname(join(dir, path)), { recursive: true })
      await writeFile(join(dir, path), content)
    }
  } catch (error) {
    await rm(dir, { recursive: true, force: true })
    throw error
  }
  const run = (cmd, args) => spawnSync(cmd, args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' })
  if (modules) {
    await symlink(modules, join(dir, 'node_modules'), 'dir')
  } else {
    // The emitted package.json has ranges and no lockfile, as a migrated site
    // starts: one retry absorbs a transient registry error.
    const npmInstall = () => run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'])
    let install = npmInstall()
    if (install.status !== 0) {
      console.warn(`npm install (${label}) failed, retrying once:\n${install.stderr}`)
      install = npmInstall()
    }
    if (install.status !== 0) {
      console.error(`npm install (${label}) failed:\n${install.stdout}${install.stderr}`)
      return { ok: false, dir }
    }
    // What the ranges resolved to: a failure after a new astro or checker
    // release reads as that, not as a mystery.
    for (const name of ['astro', '@astrojs/check', 'typescript']) {
      const version = JSON.parse(await readFile(join(dir, 'node_modules', name, 'package.json'), 'utf8')).version
      console.log(`${name} ${version}`)
    }
  }
  const result = run(join(dir, 'node_modules', '.bin', 'astro'), ['check'])
  const output = `${result.stdout}${result.stderr}`
  if (process.env.ASTRO_CHECK_DEBUG) console.log(output)
  const summary = output.split('\n').filter((line) => /error|Result|- \d+ (errors|warnings|hints)/i.test(line))
  console.log(`astro check (${label}):\n${summary.join('\n')}`)
  // A pass is a result that names 0 errors — not merely an exit code: astro
  // exits 0 when it stops at a prompt without checking anything.
  const ok = result.status === 0 && /Result \(\d+ files?\)/.test(output) && /- 0 errors/.test(output)
  if (!ok) console.error(output)
  return { ok, dir }
}

/**
 * Build the checked site and read what it wrote: the published entries have
 * pages, sitemap lines and feed items; a draft, an entry in review and a post
 * scheduled for later have none, and the live page's link to the draft is text.
 */
async function buildUnpublished(dir) {
  const result = spawnSync(join(dir, 'node_modules', '.bin', 'astro'), ['build'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' })
  if (result.status !== 0) {
    console.error(`astro build failed:\n${result.stdout}${result.stderr}`)
    return false
  }
  const read = (path) => readFile(join(dir, 'dist', path), 'utf8').catch(() => null)
  const sitemap = (await read('sitemap-0.xml')) ?? ''
  const feed = (await read('feed.xml')) ?? ''
  const llms = (await read('llms.txt')) ?? ''
  const category = (await read('kategori/haberler/yerel/index.html')) ?? ''
  const live = await read('2025/gecmis/index.html')
  const failures = []
  for (const slug of ['merhaba', 'gecmis']) {
    if (!(await read(`2025/${slug}/index.html`))) failures.push(`/2025/${slug}/ has no page`)
    if (!sitemap.includes(`/2025/${slug}/`)) failures.push(`/2025/${slug}/ is not in the sitemap`)
    if (!feed.includes(`/2025/${slug}/`)) failures.push(`/2025/${slug}/ is not in the feed`)
  }
  // The category's list: the live card and no other (the plain fallback list prints titles).
  if (!category.includes('>Geçmiş<')) failures.push('the category page does not list Geçmiş')
  for (const title of ['Gelecek', 'Taslak', 'Şifreli']) if (category.includes(`>${title}<`)) failures.push(`the category page lists ${title}`)
  for (const slug of ['gelecek', 'taslak', 'incelemede', 'sifreli', 'ozel']) {
    if (await read(`2025/${slug}/index.html`)) failures.push(`/2025/${slug}/ was built`)
    for (const [name, text] of [['sitemap', sitemap], ['feed', feed], ['llms.txt', llms], ['category page', category]]) {
      if (text.includes(`/2025/${slug}/`)) failures.push(`/2025/${slug}/ is in the ${name}`)
    }
  }
  if (await read('eski-taslak/index.html')) failures.push('the redirect to the draft was built')
  if (live && (live.includes('href="/2025/taslak/"') || live.includes('href="/2025/sifreli/"'))) failures.push('the live page still links to a held-back entry')
  if (live && !(live.includes('taslak') && live.includes('şifreli'))) failures.push('the live page lost the link text')
  // Nothing of the password-protected post anywhere in the build.
  const leak = spawnSync('grep', ['-rl', 'yalnız üyelere', join(dir, 'dist')], { encoding: 'utf8' }).stdout.trim()
  if (leak) failures.push(`the password-protected post's content is in ${leak}`)
  console.log(`astro build (unpublished entries): ${failures.length ? failures.join('; ') : 'published built; draft, in review, scheduled, password-protected and private left out'}`)
  return failures.length === 0
}

// Both address forms: the file build (no trailing slash) writes other pages.
const dirs = []
let ok = false
try {
  const slash = await check('slash', {})
  dirs.push(slash.dir)
  if (slash.ok) slash.ok = await buildUnpublished(slash.dir)
  const noSlash = slash.ok ? await check('no-slash', { trailingSlash: false }, join(slash.dir, 'node_modules')) : slash
  if (noSlash !== slash) dirs.push(noSlash.dir)
  ok = slash.ok && noSlash.ok
} finally {
  for (const dir of dirs.toReversed()) await rm(dir, { recursive: true, force: true })
}
if (!ok) process.exit(1)
