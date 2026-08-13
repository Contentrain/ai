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
      title_field: 'title',
      fields: {
        title:    { type: 'string', required: true, max: 120, label: 'Title', order: 10 },
        slug:     { type: 'slug', required: true, unique: true, label: 'Slug', order: 20 },
        category: { type: 'relation', model: 'doc-categories', label: 'Category', order: 30 },
        order:    { type: 'integer', label: 'Order', order: 40 },
        excerpt:  { type: 'text', max: 280, label: 'Excerpt', order: 50 },
      },
    },
    {
      id: 'doc-categories',
      name: 'Doc Categories',
      kind: 'collection',
      domain: 'docs',
      i18n: true,
      title_field: 'name',
      fields: {
        name:  { type: 'string', required: true, label: 'Name', order: 10 },
        slug:  { type: 'slug', required: true, unique: true, label: 'Slug', order: 20 },
        order: { type: 'integer', label: 'Order', order: 30 },
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
