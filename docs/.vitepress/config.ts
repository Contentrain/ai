import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { defineConfig } from 'vitepress'

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
  'packages/mcp',
  'packages/cli',
  'packages/sdk',
  'packages/rules',
  'packages/types',
  'guides/providers',
  'guides/http-transport',
  'guides/embedding-mcp',
  'guides/normalize',
  'guides/frameworks',
  'guides/i18n',
  'guides/serve-ui',
  'reference/model-kinds',
  'reference/field-types',
  'reference/config',
  'reference/providers',
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

export default defineConfig({
  buildEnd(siteConfig) {
    buildLlmsFull(siteConfig.srcDir, siteConfig.outDir)
  },

  title: 'Contentrain AI',
  description: 'Extract, govern, and ship structured content from your codebase.',

  ignoreDeadLinks: [
    /localhost/,
  ],

  sitemap: {
    hostname: 'https://ai.contentrain.io',
  },

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    ['meta', { name: 'theme-color', content: '#3b5afc' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'Contentrain AI' }],
    ['meta', { property: 'og:description', content: 'Extract, govern, and ship structured content from your codebase.' }],
    ['meta', { property: 'og:url', content: 'https://ai.contentrain.io' }],
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
        { text: 'Rules & Skills', link: '/packages/rules' },
        { text: 'Types', link: '/packages/types' },
      ]},
      { text: 'Guides', items: [
        { text: 'Providers & Transports', link: '/guides/providers' },
        { text: 'HTTP Transport', link: '/guides/http-transport' },
        { text: 'Embedding MCP', link: '/guides/embedding-mcp' },
        { text: 'Normalize Flow', link: '/guides/normalize' },
        { text: 'Framework Integration', link: '/guides/frameworks' },
        { text: 'i18n Workflow', link: '/guides/i18n' },
        { text: 'Serve UI', link: '/guides/serve-ui' },
      ]},
      { text: 'Reference', items: [
        { text: 'Model Kinds', link: '/reference/model-kinds' },
        { text: 'Field Types', link: '/reference/field-types' },
        { text: 'Configuration', link: '/reference/config' },
        { text: 'RepoProvider', link: '/reference/providers' },
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
          ],
        },
        {
          text: 'Packages',
          items: [
            { text: 'MCP Tools', link: '/packages/mcp' },
            { text: 'CLI', link: '/packages/cli' },
            { text: 'Query SDK', link: '/packages/sdk' },
            { text: 'Rules & Skills', link: '/packages/rules' },
            { text: 'Types', link: '/packages/types' },
          ],
        },
        {
          text: 'Guides',
          items: [
            { text: 'Providers & Transports', link: '/guides/providers' },
            { text: 'HTTP Transport', link: '/guides/http-transport' },
            { text: 'Embedding MCP', link: '/guides/embedding-mcp' },
            { text: 'Normalize Flow', link: '/guides/normalize' },
            { text: 'Framework Integration', link: '/guides/frameworks' },
            { text: 'i18n Workflow', link: '/guides/i18n' },
            { text: 'Serve UI', link: '/guides/serve-ui' },
          ],
        },
        {
          text: 'Reference',
          items: [
            { text: 'Model Kinds', link: '/reference/model-kinds' },
            { text: 'Field Types', link: '/reference/field-types' },
            { text: 'Configuration', link: '/reference/config' },
            { text: 'RepoProvider', link: '/reference/providers' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/Contentrain/ai' },
    ],

    footer: {
      message: 'Released under the MIT License.<br><div class="footer-social-links"><a href="https://discord.gg/8XbFKfgeZx" target="_blank" rel="noopener" aria-label="Discord">Discord</a> · <a href="https://x.com/Contentrain_io" target="_blank" rel="noopener" aria-label="X">X</a> · <a href="https://www.linkedin.com/company/contentrain" target="_blank" rel="noopener" aria-label="LinkedIn">LinkedIn</a> · <a href="https://www.youtube.com/@contentrain" target="_blank" rel="noopener" aria-label="YouTube">YouTube</a> · <a href="https://www.instagram.com/contentrain_" target="_blank" rel="noopener" aria-label="Instagram">Instagram</a> · <a href="https://www.facebook.com/Contentrain.io" target="_blank" rel="noopener" aria-label="Facebook">Facebook</a></div>',
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
})
