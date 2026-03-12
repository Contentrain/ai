import type { ScaffoldTemplate } from '@contentrain/types'

export const ecommerceTemplate: ScaffoldTemplate = {
  id: 'ecommerce',
  models: [
    {
      id: 'products',
      name: 'Products',
      kind: 'collection',
      domain: 'shop',
      i18n: true,
      fields: {
        name:        { type: 'string', required: true },
        slug:        { type: 'slug', required: true, unique: true },
        description: { type: 'text' },
        price:       { type: 'decimal', required: true },
        currency:    { type: 'string', default: 'USD' },
        image:       { type: 'image' },
        category:    { type: 'relation', model: 'product-categories' },
        brand:       { type: 'relation', model: 'brands' },
        in_stock:    { type: 'boolean', default: true },
      },
    },
    {
      id: 'product-categories',
      name: 'Product Categories',
      kind: 'collection',
      domain: 'shop',
      i18n: true,
      fields: {
        name:        { type: 'string', required: true },
        slug:        { type: 'slug', required: true, unique: true },
        description: { type: 'text' },
        image:       { type: 'image' },
      },
    },
    {
      id: 'brands',
      name: 'Brands',
      kind: 'collection',
      domain: 'shop',
      i18n: false,
      fields: {
        name:    { type: 'string', required: true },
        slug:    { type: 'slug', required: true, unique: true },
        logo:    { type: 'image' },
        website: { type: 'url' },
      },
    },
  ],
  sample_content: {
    'product-categories': {
      en: {
        'cat-electronics': { name: 'Electronics', slug: 'electronics', description: 'Electronic devices and accessories' },
        'cat-clothing': { name: 'Clothing', slug: 'clothing', description: 'Apparel and fashion' },
      },
    },
    brands: {
      data: {
        'brand-acme': { name: 'Acme Corp', slug: 'acme', website: 'https://example.com' },
      },
    },
  },
  vocabulary: {
    'add-to-cart': { en: 'Add to Cart' },
    'out-of-stock': { en: 'Out of Stock' },
    'price':        { en: 'Price' },
    'category':     { en: 'Category' },
  },
}
