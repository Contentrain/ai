import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type HeadConfig } from 'vitepress'

/**
 * Preferred order for /llms-full.txt — mirrors the sidebar. Pages not listed
 * here are appended afterwards so the corpus stays complete when a page is
 * added without updating this list.
 */
const LLMS_PAGE_ORDER = [
  'index',
  'getting-started',
  'demo',
  'ecosystem',
  'concepts',
  'studio',
  'faq',
  'packages/mcp',
  'packages/cli',
  'packages/sdk',
  'packages/rules',
  'packages/skills',
  'packages/types',
  'packages/wp-import',
  'packages/emitter-astro',
  'packages/verify',
  'packages/astro-kit',
  'packages/decide',
  'packages/plugin',
  'guides/first-model',
  'guides/providers',
  'guides/http-transport',
  'guides/embedding-mcp',
  'guides/normalize',
  'guides/frameworks',
  'guides/i18n',
  'guides/serve-ui',
  'guides/migration',
  'guides/forms-comments',
  'reference/model-kinds',
  'reference/field-types',
  'reference/config',
  'reference/providers',
  'reference/reconcile',
]

function allMarkdownPages(dir: string, root: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'public') continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...allMarkdownPages(full, root))
    else if (entry.name.endsWith('.md')) out.push(relative(root, full).replace(/\.md$/, ''))
  }
  return out
}

function stripFrontmatter(md: string): { body: string, title?: string } {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(md)
  if (!m) return { body: md }
  const title = /(?:^|\n)title:\s*["']?([^"'\n]+)["']?/.exec(m[1])?.[1]?.trim()
  return { body: md.slice(m[0].length), title }
}

/** Generate /llms-full.txt into the build output — the whole site as one markdown file. */
function buildLlmsFull(srcDir: string, outDir: string): void {
  const discovered = allMarkdownPages(srcDir, srcDir)
  const ordered = [
    ...LLMS_PAGE_ORDER.filter(p => discovered.includes(p)),
    ...discovered.filter(p => !LLMS_PAGE_ORDER.includes(p)).toSorted(),
  ]
  const sections = ordered.map((page) => {
    const raw = readFileSync(resolve(srcDir, `${page}.md`), 'utf-8')
    const { body, title } = stripFrontmatter(raw)
    const heading = title ?? /^#\s+(.+)$/m.exec(body)?.[1] ?? page
    const url = page === 'index' ? 'https://ai.contentrain.io/' : `https://ai.contentrain.io/${page}`
    return `# ${heading}\nSource: ${url}\n\n${body.trim()}\n`
  })
  const header = '# Contentrain AI — Full Documentation\n\n'
    + '> The complete ai.contentrain.io documentation as a single markdown file for LLM ingestion. '
    + 'Curated index: https://ai.contentrain.io/llms.txt\n\n'
  writeFileSync(join(outDir, 'llms-full.txt'), header + sections.join('\n---\n\n'))
}

const SITE = 'https://ai.contentrain.io'
const SITE_TITLE = 'Contentrain AI'
const SITE_DESCRIPTION = 'Extract, govern, and ship structured content from your codebase.'

/** `packages/mcp.md` → `https://ai.contentrain.io/packages/mcp`; `index.md` → the site root. */
function pageUrl(relativePath: string): string {
  const path = relativePath.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '')
  return `${SITE}/${path}`
}

/** The sidebar group a page sits in, for the breadcrumb ("Packages", "Guides", …). */
function sectionOf(relativePath: string): string | undefined {
  const top = relativePath.split('/')[0]
  return { packages: 'Packages', guides: 'Guides', reference: 'Reference' }[top]
}

/** Strip tags and decode the few entities VitePress emits, for JSON-LD text. */
function plainText(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\u200b/g, '').replace(/\s+/g, ' ').trim()
}

/** FAQPage entities from a rendered page: every markdown `<h2>` (sidebar group titles have no id) is a question, the HTML up to the next one or the doc footer its answer. */
function faqEntities(content: string): object[] {
  return [...content.matchAll(/<h2 id=[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2[\s>]|<footer[\s>]|$)/g)].map(([, q, a]) => ({
    '@type': 'Question',
    'name': plainText(q),
    'acceptedAnswer': { '@type': 'Answer', 'text': plainText(a) },
  }))
}

/**
 * Per-page head: one canonical address (the clean URL, which the sitemap lists too), the page's own Open Graph and
 * Twitter title/description/url, and JSON-LD — the WebSite on the home page, a TechArticle with its breadcrumb on
 * every other page.
 */
function pageHead(relativePath: string, title: string, description: string, content = ''): HeadConfig[] {
  const url = pageUrl(relativePath)
  const home = url === `${SITE}/`
  const fullTitle = home ? SITE_TITLE : `${title} | ${SITE_TITLE}`
  const publisher = { '@type': 'Organization', 'name': 'Contentrain', 'url': 'https://contentrain.io', 'logo': `${SITE}/logo/contentrain-512.png` }
  const section = sectionOf(relativePath)
  const graph = home
    ? [{ '@type': 'WebSite', 'name': SITE_TITLE, url, description, publisher }]
    : [
        { '@type': 'TechArticle', 'headline': title, description, url, 'inLanguage': 'en', 'isPartOf': { '@type': 'WebSite', 'name': SITE_TITLE, 'url': `${SITE}/` }, publisher },
        {
          '@type': 'BreadcrumbList',
          'itemListElement': [
            { '@type': 'ListItem', 'position': 1, 'name': SITE_TITLE, 'item': `${SITE}/` },
            { '@type': 'ListItem', 'position': 2, 'name': section ? `${section}: ${title}` : title, 'item': url },
          ],
        },
        ...(relativePath === 'faq.md' ? [{ '@type': 'FAQPage', url, 'mainEntity': faqEntities(content) }] : []),
      ]
  return [
    ['link', { rel: 'canonical', href: url }],
    ['meta', { property: 'og:title', content: fullTitle }],
    ['meta', { property: 'og:description', content: description }],
    ['meta', { property: 'og:url', content: url }],
    ['meta', { name: 'twitter:title', content: fullTitle }],
    ['meta', { name: 'twitter:description', content: description }],
    ['script', { type: 'application/ld+json' }, JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })],
  ]
}

export default defineConfig({
  buildEnd(siteConfig) {
    buildLlmsFull(siteConfig.srcDir, siteConfig.outDir)
  },

  title: SITE_TITLE,
  description: SITE_DESCRIPTION,

  // One address per page: `/packages/mcp`, not also `/packages/mcp.html` (the sitemap listed the .html form while
  // every link and llms-full.txt use the clean one).
  cleanUrls: true,

  ignoreDeadLinks: [
    /localhost/,
  ],

  sitemap: {
    hostname: SITE,
  },

  transformHead({ pageData, title, description, content }) {
    if (pageData.isNotFound) return []
    return pageHead(pageData.relativePath, pageData.frontmatter.title ?? pageData.title ?? title, description || SITE_DESCRIPTION, content)
  },

  // The hero image is the home page's LCP element. A preload ahead of the font preload starts its request with the
  // CSS; transformHead output lands after the module preloads, where it measured no gain.
  transformHtml(html, _id, { pageData }) {
    const hero = pageData.frontmatter.hero?.image?.src
    if (typeof hero !== 'string') return
    const tag = `<link rel="preload" href="${hero}" as="image" fetchpriority="high">`
    const font = html.search(/<link rel="preload" [^>]*as="font"/)
    const at = font === -1 ? html.indexOf('</head>') : font
    return `${html.slice(0, at)}${tag}\n    ${html.slice(at)}`
  },

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    ['meta', { name: 'theme-color', content: '#3b5afc' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: SITE_TITLE }],
    ['meta', { property: 'og:image', content: 'https://ai.contentrain.io/og-image.png' }],
    ['meta', { property: 'og:image:width', content: '1200' }],
    ['meta', { property: 'og:image:height', content: '630' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:site', content: '@Contentrain_io' }],
    ['meta', { name: 'twitter:image', content: 'https://ai.contentrain.io/og-image.png' }],
  ],

  themeConfig: {
    logo: {
      light: '/logo/color-icon-black-text.svg',
      dark: '/logo/color-icon-white-text.svg',
      alt: 'Contentrain AI',
    },

    siteTitle: false,

    nav: [
      { text: 'Getting Started', link: '/getting-started' },
      { text: 'Ecosystem', link: '/ecosystem' },
      { text: 'Studio', link: '/studio' },
      { text: 'Packages', items: [
        { text: 'MCP Tools', link: '/packages/mcp' },
        { text: 'CLI', link: '/packages/cli' },
        { text: 'Query SDK', link: '/packages/sdk' },
        { text: 'Rules', link: '/packages/rules' },
        { text: 'Skills', link: '/packages/skills' },
        { text: 'Types', link: '/packages/types' },
        { text: 'WordPress Import', link: '/packages/wp-import' },
        { text: 'Astro Emitter', link: '/packages/emitter-astro' },
        { text: 'Verify', link: '/packages/verify' },
        { text: 'Astro Kit', link: '/packages/astro-kit' },
        { text: 'Decide', link: '/packages/decide' },
        { text: 'Claude Code Plugin', link: '/packages/plugin' },
      ]},
      { text: 'Guides', items: [
        { text: 'Your First Model', link: '/guides/first-model' },
        { text: 'Providers & Transports', link: '/guides/providers' },
        { text: 'HTTP Transport', link: '/guides/http-transport' },
        { text: 'Embedding MCP', link: '/guides/embedding-mcp' },
        { text: 'Normalize Flow', link: '/guides/normalize' },
        { text: 'Framework Integration', link: '/guides/frameworks' },
        { text: 'i18n Workflow', link: '/guides/i18n' },
        { text: 'Serve UI', link: '/guides/serve-ui' },
        { text: 'WordPress Migration', link: '/guides/migration' },
        { text: 'Forms & Comments', link: '/guides/forms-comments' },
      ]},
      { text: 'Reference', items: [
        { text: 'Model Kinds', link: '/reference/model-kinds' },
        { text: 'Field Types', link: '/reference/field-types' },
        { text: 'Configuration', link: '/reference/config' },
        { text: 'RepoProvider', link: '/reference/providers' },
        { text: 'Reconcile & Divergence', link: '/reference/reconcile' },
      ]},
      { text: 'Starters', link: 'https://github.com/orgs/Contentrain/repositories?q=contentrain-starter&type=template' },
    ],

    sidebar: {
      '/': [
        {
          text: 'Introduction',
          items: [
            { text: 'What is Contentrain AI?', link: '/getting-started' },
            { text: '2-Minute Demo', link: '/demo' },
            { text: 'Ecosystem Map', link: '/ecosystem' },
            { text: 'Core Concepts', link: '/concepts' },
            { text: 'Contentrain Studio', link: '/studio' },
            { text: 'FAQ', link: '/faq' },
          ],
        },
        {
          text: 'Packages',
          items: [
            { text: 'MCP Tools', link: '/packages/mcp' },
            { text: 'CLI', link: '/packages/cli' },
            { text: 'Query SDK', link: '/packages/sdk' },
            { text: 'Rules', link: '/packages/rules' },
            { text: 'Skills', link: '/packages/skills' },
            { text: 'Types', link: '/packages/types' },
            { text: 'WordPress Import', link: '/packages/wp-import' },
            { text: 'Astro Emitter', link: '/packages/emitter-astro' },
            { text: 'Verify', link: '/packages/verify' },
            { text: 'Astro Kit', link: '/packages/astro-kit' },
            { text: 'Decide', link: '/packages/decide' },
            { text: 'Claude Code Plugin', link: '/packages/plugin' },
          ],
        },
        {
          text: 'Guides',
          items: [
            { text: 'Your First Model', link: '/guides/first-model' },
            { text: 'Providers & Transports', link: '/guides/providers' },
            { text: 'HTTP Transport', link: '/guides/http-transport' },
            { text: 'Embedding MCP', link: '/guides/embedding-mcp' },
            { text: 'Normalize Flow', link: '/guides/normalize' },
            { text: 'Framework Integration', link: '/guides/frameworks' },
            { text: 'i18n Workflow', link: '/guides/i18n' },
            { text: 'Serve UI', link: '/guides/serve-ui' },
            { text: 'WordPress Migration', link: '/guides/migration' },
            { text: 'Forms & Comments', link: '/guides/forms-comments' },
          ],
        },
        {
          text: 'Reference',
          items: [
            { text: 'Model Kinds', link: '/reference/model-kinds' },
            { text: 'Field Types', link: '/reference/field-types' },
            { text: 'Configuration', link: '/reference/config' },
            { text: 'RepoProvider', link: '/reference/providers' },
            { text: 'Reconcile & Divergence', link: '/reference/reconcile' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/Contentrain/ai' },
    ],

    footer: {
      message: 'Released under the MIT License.<br><span class="footer-social-links"><a href="https://discord.gg/8XbFKfgeZx" target="_blank" rel="noopener" aria-label="Discord">Discord</a> · <a href="https://x.com/Contentrain_io" target="_blank" rel="noopener" aria-label="X">X</a> · <a href="https://www.linkedin.com/company/contentrain" target="_blank" rel="noopener" aria-label="LinkedIn">LinkedIn</a> · <a href="https://www.youtube.com/@contentrain" target="_blank" rel="noopener" aria-label="YouTube">YouTube</a> · <a href="https://www.instagram.com/contentrain_" target="_blank" rel="noopener" aria-label="Instagram">Instagram</a> · <a href="https://www.facebook.com/Contentrain.io" target="_blank" rel="noopener" aria-label="Facebook">Facebook</a></span>',
      copyright: 'Copyright © 2024-present Contentrain',
    },

    search: {
      provider: 'local',
    },

    editLink: {
      pattern: 'https://github.com/Contentrain/ai/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },
  },

  markdown: {
    codeTransformers: [
      {
        // Some github-light/dark token colors (comments, green strings) fall below
        // 4.5:1 on the code block background; nudge those toward black or white.
        span(node) {
          const style = node.properties.style
          if (typeof style !== 'string') return
          node.properties.style = style.replace(
            /--shiki-(light|dark):(#[0-9a-f]{6})/gi,
            (_, theme: 'light' | 'dark', color: string) => `--shiki-${theme}:${readableOn(color, theme)}`,
          )
        },
      },
    ],
  },

  vite: {
    resolve: {
      // Override internal theme components. The exact relative specifiers match only
      // the theme's own imports, so the wrappers can still import the originals.
      alias: [
        { find: /^\.\/VPHome\.vue$/, replacement: fileURLToPath(new URL('./theme/components/HomeMain.vue', import.meta.url)) },
        { find: /^\.\/VPHomeContent\.vue$/, replacement: fileURLToPath(new URL('./theme/components/HomeContent.vue', import.meta.url)) },
      ],
    },
  },
})

/** Code block backgrounds (--vp-code-block-bg) the shiki colors are checked against. */
const CODE_BG = { light: '#f6f6f7', dark: '#161618' } as const

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].toSorted((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** The color itself when it has 4.6:1 (AA is 4.5) on the theme's code background, else the nearest mix toward black (light) or white (dark) that does. */
function readableOn(color: string, theme: 'light' | 'dark'): string {
  const bg = CODE_BG[theme]
  const target = theme === 'light' ? 0 : 255
  const rgb = [1, 3, 5].map(i => Number.parseInt(color.slice(i, i + 2), 16))
  for (let t = 0; t <= 1; t += 0.02) {
    const mixed = `#${rgb.map(v => Math.round(v + (target - v) * t).toString(16).padStart(2, '0')).join('')}`
    if (contrast(mixed, bg) >= 4.6) return t === 0 ? color : mixed.toUpperCase()
  }
  return color
}
