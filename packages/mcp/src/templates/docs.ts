import type { ScaffoldTemplate } from '@contentrain/types'

export const docsTemplate: ScaffoldTemplate = {
  id: 'docs',
  models: [
    {
      id: 'doc-page',
      name: 'Documentation Page',
      kind: 'document',
      domain: 'docs',
      i18n: true,
      fields: {
        title:    { type: 'string', required: true, max: 120 },
        slug:     { type: 'slug', required: true, unique: true },
        category: { type: 'relation', model: 'doc-categories' },
        order:    { type: 'integer' },
        excerpt:  { type: 'text', max: 280 },
      },
    },
    {
      id: 'doc-categories',
      name: 'Doc Categories',
      kind: 'collection',
      domain: 'docs',
      i18n: true,
      fields: {
        name:  { type: 'string', required: true },
        slug:  { type: 'slug', required: true, unique: true },
        order: { type: 'integer' },
      },
    },
  ],
  sample_content: {
    'doc-categories': {
      en: {
        'cat-getting-started': { name: 'Getting Started', slug: 'getting-started', order: 1 },
        'cat-guides': { name: 'Guides', slug: 'guides', order: 2 },
        'cat-api': { name: 'API Reference', slug: 'api', order: 3 },
      },
    },
  },
  vocabulary: {
    'on-this-page':  { en: 'On This Page' },
    'edit-this-page': { en: 'Edit this page' },
    'next':          { en: 'Next' },
    'previous':      { en: 'Previous' },
  },
}
