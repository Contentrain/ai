// Generated from .contentrain/models by Contentrain Migrate — regenerate, do not edit.
//
// One collection per Contentrain model, read through @contentrain/query's
// loader; each schema mirrors its model. Public builds show published
// entries only: drafts and entries in review stay in Studio until approved.

import { contentrainLoader } from '@contentrain/query/astro'
import { defineCollection, reference } from 'astro:content'
import { z } from 'astro/zod'

const loader = (model: string) => contentrainLoader({ model, publishedOnly: true })

export const collections = {
  authors: defineCollection({
    loader: loader('authors'),
    schema: z.object({
      id: z.string(),
      avatar: z.string().optional(),
      bio: z.string().optional(),
      email: z.string().optional(),
      name: z.string(),
      slug: z.string(),
      wp_id: z.number().int().optional(),
    }),
  }),
  categories: defineCollection({
    loader: loader('categories'),
    schema: z.object({
      id: z.string(),
      description: z.string().optional(),
      name: z.string(),
      parent: reference('categories').optional(),
      slug: z.string(),
      wp_id: z.number().int().optional(),
    }),
  }),
  media: defineCollection({
    loader: loader('media'),
    schema: z.object({
      id: z.string(),
      alt: z.string().optional(),
      caption: z.string().optional(),
      height: z.number().int().optional(),
      mime: z.string().optional(),
      slug: z.string(),
      title: z.string(),
      url: z.string(),
      width: z.number().int().optional(),
      wp_id: z.number().int().optional(),
    }),
  }),
  menuItems: defineCollection({
    loader: loader('menu-items'),
    schema: z.object({
      id: z.string(),
      classes: z.array(z.string()).optional(),
      description: z.string().optional(),
      menu: reference('menus'),
      open_in_new_tab: z.boolean().default(false),
      order: z.number().int().optional(),
      parent: reference('menuItems').optional(),
      target: z.object({ model: z.string(), ref: z.string() }).optional(),
      title: z.string(),
      type: z.enum(['custom', 'post_type', 'taxonomy', 'post_type_archive']).optional(),
      url: z.string().optional(),
      wp_id: z.number().int().optional(),
    }),
  }),
  menus: defineCollection({
    loader: loader('menus'),
    schema: z.object({
      id: z.string(),
      items: z.array(reference('menuItems')).default([]),
      locations: z.array(z.string()).optional(),
      name: z.string(),
      slug: z.string(),
      wp_id: z.number().int().optional(),
    }),
  }),
  pages: defineCollection({
    loader: loader('pages'),
    schema: z.object({
      id: z.string(),
      body: z.string().optional(),
      cover: reference('media').optional(),
      excerpt: z.string().optional(),
      form: z.string().optional(),
      link: z.string().optional(),
      menu_order: z.number().int().optional(),
      modified_at: z.coerce.date().optional(),
      parent: reference('pages').optional(),
      published_at: z.coerce.date().optional(),
      seo: z.object({
      canonical: z.string().optional(),
      description: z.string().optional(),
      image: z.string().optional(),
      nofollow: z.boolean().default(false),
      noindex: z.boolean().default(false),
      title: z.string().optional(),
    }).optional(),
      slug: z.string(),
      title: z.string(),
      wp_id: z.number().int().optional(),
    }),
  }),
  posts: defineCollection({
    loader: loader('posts'),
    schema: z.object({
      id: z.string(),
      author: reference('authors').optional(),
      body: z.string().optional(),
      categories: z.array(reference('categories')).default([]),
      comments_open: z.boolean().default(false),
      cover: reference('media').optional(),
      excerpt: z.string().optional(),
      link: z.string().optional(),
      modified_at: z.coerce.date().optional(),
      published_at: z.coerce.date().optional(),
      seo: z.object({
      canonical: z.string().optional(),
      description: z.string().optional(),
      image: z.string().optional(),
      nofollow: z.boolean().default(false),
      noindex: z.boolean().default(false),
      title: z.string().optional(),
    }).optional(),
      slug: z.string(),
      sticky: z.boolean().default(false),
      tags: z.array(reference('tags')).default([]),
      title: z.string(),
      wp_id: z.number().int().optional(),
    }),
  }),
  redirects: defineCollection({
    loader: loader('redirects'),
    schema: z.object({
      id: z.string(),
      from: z.string(),
      status: z.number().int().default(301),
      to: z.string().optional(),
    }),
  }),
  site: defineCollection({
    loader: loader('site'),
    schema: z.object({
      analytics_host: z.string().optional(),
      analytics_id: z.string().optional(),
      analytics_provider: z.enum(['ga4', 'gtm', 'plausible', 'fathom', 'matomo']).optional(),
      language: z.string().optional(),
      logo: z.string().optional(),
      organization: z.string().optional(),
      same_as: z.array(z.string()).optional(),
      social_image: z.string().optional(),
      tagline: z.string().optional(),
      title: z.string(),
      url: z.string().optional(),
    }),
  }),
  tags: defineCollection({
    loader: loader('tags'),
    schema: z.object({
      id: z.string(),
      description: z.string().optional(),
      name: z.string(),
      slug: z.string(),
      wp_id: z.number().int().optional(),
    }),
  }),
  uiStrings: defineCollection({
    loader: loader('ui-strings'),
    schema: z.object({ key: z.string(), value: z.string(), locale: z.string().optional() }),
  }),
}
