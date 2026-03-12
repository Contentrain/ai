import type { ScaffoldTemplate } from '@contentrain/types'

export const blogTemplate: ScaffoldTemplate = {
  id: 'blog',
  models: [
    {
      id: 'blog-post',
      name: 'Blog Post',
      kind: 'document',
      domain: 'blog',
      i18n: true,
      fields: {
        title:        { type: 'string', required: true, max: 120 },
        slug:         { type: 'slug', required: true, unique: true },
        excerpt:      { type: 'text', max: 280 },
        cover:        { type: 'image' },
        author:       { type: 'relation', model: 'authors', required: true },
        category:     { type: 'relation', model: 'categories' },
        tags:         { type: 'array', items: 'string' },
        published_at: { type: 'datetime' },
      },
    },
    {
      id: 'categories',
      name: 'Categories',
      kind: 'collection',
      domain: 'blog',
      i18n: true,
      fields: {
        name:        { type: 'string', required: true },
        slug:        { type: 'slug', required: true, unique: true },
        description: { type: 'text' },
      },
    },
    {
      id: 'authors',
      name: 'Authors',
      kind: 'collection',
      domain: 'blog',
      i18n: false,
      fields: {
        name:   { type: 'string', required: true },
        email:  { type: 'email' },
        bio:    { type: 'text' },
        avatar: { type: 'image' },
        social: {
          type: 'object',
          fields: {
            twitter:  { type: 'url' },
            linkedin: { type: 'url' },
            github:   { type: 'url' },
          },
        },
      },
    },
  ],
  sample_content: {
    categories: {
      en: {
        'cat-engineering': { name: 'Engineering', slug: 'engineering', description: 'Technical deep dives' },
        'cat-product': { name: 'Product', slug: 'product', description: 'Product updates and news' },
      },
    },
    authors: {
      data: {
        'author-1': { name: 'Team', email: 'team@example.com', bio: 'The team behind the product' },
      },
    },
  },
  vocabulary: {
    'read-more':    { en: 'Read More' },
    'published-on': { en: 'Published on' },
    'by-author':    { en: 'By' },
    'categories':   { en: 'Categories' },
    'tags':         { en: 'Tags' },
  },
}
