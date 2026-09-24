// Content collections. Every collection reads its Contentrain model through
// @contentrain/query's loader — the site has no other source of content — and
// each schema mirrors `.contentrain/models/<id>.json`, so a field an editor
// adds in Studio fails the build here until the site knows about it.
//
// Public builds show published entries only: drafts and entries in review
// stay in Studio until they are approved.

import { contentrainLoader } from '@contentrain/query/astro'
import { defineCollection, reference } from 'astro:content'
import { z } from 'astro/zod'

const loader = (model: string) => contentrainLoader({ model, publishedOnly: true })

/** Contentrain `datetime` is ISO 8601 text. */
const datetime = z.coerce.date()

const seo = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  canonical: z.url().optional(),
  image: z.string().optional(),
  noindex: z.boolean().optional(),
  nofollow: z.boolean().optional(),
}).optional()

const term = (model: 'categories' | 'tags') => defineCollection({
  loader: loader(model),
  schema: z.object({
    name: z.string(),
    slug: z.string(),
    description: z.string().optional(),
    parent: reference(model).optional(),
    wp_id: z.number().int().optional(),
  }),
})

export const collections = {
  site: defineCollection({
    loader: loader('site'),
    schema: z.object({
      title: z.string(),
      tagline: z.string().optional(),
      url: z.url().optional(),
      language: z.string().optional(),
      logo: z.string().optional(),
      social_image: z.string().optional(),
      organization: z.string().optional(),
      same_as: z.array(z.url()).optional(),
    }),
  }),

  posts: defineCollection({
    loader: loader('posts'),
    schema: z.object({
      title: z.string(),
      slug: z.string(),
      excerpt: z.string().optional(),
      body: z.string().optional(),
      published_at: datetime.optional(),
      modified_at: datetime.optional(),
      author: reference('authors').optional(),
      categories: z.array(reference('categories')).default([]),
      tags: z.array(reference('tags')).default([]),
      cover: reference('media').optional(),
      wp_id: z.number().int().optional(),
      link: z.url().optional(),
      sticky: z.boolean().default(false),
      comments_open: z.boolean().default(false),
      seo,
    }),
  }),

  pages: defineCollection({
    loader: loader('pages'),
    schema: z.object({
      title: z.string(),
      slug: z.string(),
      excerpt: z.string().optional(),
      body: z.string().optional(),
      published_at: datetime.optional(),
      modified_at: datetime.optional(),
      cover: reference('media').optional(),
      parent: reference('pages').optional(),
      menu_order: z.number().int().default(0),
      wp_id: z.number().int().optional(),
      link: z.url().optional(),
      form: z.string().optional(),
      seo,
    }),
  }),

  categories: term('categories'),
  tags: term('tags'),

  authors: defineCollection({
    loader: loader('authors'),
    schema: z.object({
      name: z.string(),
      slug: z.string(),
      bio: z.string().optional(),
      avatar: z.string().optional(),
      email: z.email().optional(),
      wp_id: z.number().int().optional(),
    }),
  }),

  media: defineCollection({
    loader: loader('media'),
    schema: z.object({
      title: z.string(),
      slug: z.string(),
      url: z.string(),
      alt: z.string().optional(),
      caption: z.string().optional(),
      mime: z.string().optional(),
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
      wp_id: z.number().int().optional(),
    }),
  }),

  menus: defineCollection({
    loader: loader('menus'),
    schema: z.object({
      name: z.string(),
      slug: z.string(),
      items: z.array(reference('menuItems')).default([]),
      wp_id: z.number().int().optional(),
    }),
  }),

  menuItems: defineCollection({
    loader: loader('menu-items'),
    schema: z.object({
      title: z.string(),
      menu: reference('menus'),
      order: z.number().int().default(0),
      parent: reference('menuItems').optional(),
      url: z.string().optional(),
      open_in_new_tab: z.boolean().default(false),
      wp_id: z.number().int().optional(),
    }),
  }),

  uiStrings: defineCollection({
    loader: loader('ui-strings'),
    schema: z.object({ key: z.string(), value: z.string(), locale: z.string().optional() }),
  }),
}
