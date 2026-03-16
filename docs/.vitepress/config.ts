import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Contentrain AI',
  description: 'AI content governance infrastructure — MCP tools, CLI, SDK, and AI rules for managing content across any framework.',

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    ['meta', { name: 'theme-color', content: '#3b5afc' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'Contentrain AI' }],
    ['meta', { property: 'og:description', content: 'AI content governance infrastructure for modern web projects' }],
    ['meta', { property: 'og:url', content: 'https://ai.contentrain.io' }],
  ],

  themeConfig: {
    logo: {
      light: '/logo/color-icon-black-text.svg',
      dark: '/logo/color-icon-white-text.svg',
    },

    siteTitle: false,

    nav: [
      { text: 'Getting Started', link: '/getting-started' },
      { text: 'Packages', items: [
        { text: 'MCP Tools', link: '/packages/mcp' },
        { text: 'CLI', link: '/packages/cli' },
        { text: 'Query SDK', link: '/packages/sdk' },
        { text: 'Rules & Skills', link: '/packages/rules' },
      ]},
      { text: 'Guides', items: [
        { text: 'Normalize Flow', link: '/guides/normalize' },
        { text: 'Framework Integration', link: '/guides/frameworks' },
        { text: 'i18n Workflow', link: '/guides/i18n' },
        { text: 'Serve UI', link: '/guides/serve-ui' },
      ]},
      { text: 'Reference', items: [
        { text: 'Model Kinds', link: '/reference/model-kinds' },
        { text: 'Field Types', link: '/reference/field-types' },
        { text: 'Configuration', link: '/reference/config' },
      ]},
    ],

    sidebar: {
      '/': [
        {
          text: 'Introduction',
          items: [
            { text: 'What is Contentrain AI?', link: '/getting-started' },
            { text: 'Core Concepts', link: '/concepts' },
          ],
        },
        {
          text: 'Packages',
          items: [
            { text: 'MCP Tools', link: '/packages/mcp' },
            { text: 'CLI', link: '/packages/cli' },
            { text: 'Query SDK', link: '/packages/sdk' },
            { text: 'Rules & Skills', link: '/packages/rules' },
          ],
        },
        {
          text: 'Guides',
          items: [
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
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/Contentrain/ai' },
    ],

    footer: {
      message: 'Released under the MIT License.',
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
