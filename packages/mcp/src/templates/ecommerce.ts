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
      title_field: 'name',
      fields: {
        name:        { type: 'string', required: true, label: 'Name', order: 10 },
        slug:        { type: 'slug', required: true, unique: true, label: 'Slug', order: 20 },
        description: { type: 'text', label: 'Description', order: 30 },
        price:       { type: 'decimal', required: true, label: 'Price', order: 40 },
        currency:    { type: 'string', default: 'USD', label: 'Currency', order: 50 },
        image:       { type: 'image', label: 'Image', order: 60 },
        category:    { type: 'relation', model: 'product-categories', label: 'Category', order: 70 },
        brand:       { type: 'relation', model: 'brands', label: 'Brand', order: 80 },
        in_stock:    { type: 'boolean', default: true, label: 'In stock', order: 90 },
      },
    },
    {
      id: 'product-categories',
      name: 'Product Categories',
      kind: 'collection',
      domain: 'shop',
      i18n: true,
      title_field: 'name',
      fields: {
        name:        { type: 'string', required: true, label: 'Name', order: 10 },
        slug:        { type: 'slug', required: true, unique: true, label: 'Slug', order: 20 },
        description: { type: 'text', label: 'Description', order: 30 },
        image:       { type: 'image', label: 'Image', order: 40 },
      },
    },
    {
      id: 'brands',
      name: 'Brands',
      kind: 'collection',
      domain: 'shop',
      i18n: false,
      title_field: 'name',
      fields: {
        name:    { type: 'string', required: true, label: 'Name', order: 10 },
        slug:    { type: 'slug', required: true, unique: true, label: 'Slug', order: 20 },
        logo:    { type: 'image', label: 'Logo', order: 30 },
        website: { type: 'url', label: 'Website', order: 40 },
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
