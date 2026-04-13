import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Contentrain AI',
  description: 'Extract, govern, and ship structured content from your codebase.',

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
      { text: 'Starters', link: 'https://github.com/orgs/Contentrain/repositories?q=contentrain-starter&type=template' },
    ],

    sidebar: {
      '/': [
        {
          text: 'Introduction',
          items: [
            { text: 'What is Contentrain AI?', link: '/getting-started' },
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
      { icon: 'discord', link: 'https://discord.gg/8XbFKfgeZx' },
      { icon: 'x', link: 'https://x.com/Contentrain_io' },
      { icon: 'linkedin', link: 'https://www.linkedin.com/company/contentrain' },
      { icon: 'youtube', link: 'https://www.youtube.com/@contentrain' },
      { icon: 'instagram', link: 'https://www.instagram.com/contentrain_' },
      { icon: 'facebook', link: 'https://www.facebook.com/Contentrain.io' },
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
