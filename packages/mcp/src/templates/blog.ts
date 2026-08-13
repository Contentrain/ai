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
      title_field: 'title',
      fields: {
        title:        { type: 'string', required: true, max: 120, label: 'Title', order: 10 },
        slug:         { type: 'slug', required: true, unique: true, label: 'Slug', order: 20 },
        excerpt:      { type: 'text', max: 280, label: 'Excerpt', order: 30 },
        cover:        { type: 'image', label: 'Cover', order: 40 },
        author:       { type: 'relation', model: 'authors', required: true, label: 'Author', order: 50 },
        category:     { type: 'relation', model: 'categories', label: 'Category', order: 60 },
        tags:         { type: 'array', items: 'string', label: 'Tags', order: 70 },
        published_at: { type: 'datetime', label: 'Published at', order: 80 },
      },
    },
    {
      id: 'categories',
      name: 'Categories',
      kind: 'collection',
      domain: 'blog',
      i18n: true,
      title_field: 'name',
      fields: {
        name:        { type: 'string', required: true, label: 'Name', order: 10 },
        slug:        { type: 'slug', required: true, unique: true, label: 'Slug', order: 20 },
        description: { type: 'text', label: 'Description', order: 30 },
      },
    },
    {
      id: 'authors',
      name: 'Authors',
      kind: 'collection',
      domain: 'blog',
      i18n: false,
      title_field: 'name',
      fields: {
        name:   { type: 'string', required: true, label: 'Name', order: 10 },
        email:  { type: 'email', label: 'Email', order: 20 },
        bio:    { type: 'text', label: 'Bio', order: 30 },
        avatar: { type: 'image', label: 'Avatar', order: 40 },
        social: {
          type: 'object',
          fields: {
            twitter:  { type: 'url', label: 'Twitter', order: 10 },
            linkedin: { type: 'url', label: 'Linkedin', order: 20 },
            github:   { type: 'url', label: 'Github', order: 30 },
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
