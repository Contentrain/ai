import type { ScaffoldTemplate } from '@contentrain/types'

export const saasTemplate: ScaffoldTemplate = {
  id: 'saas',
  models: [
    {
      id: 'hero',
      name: 'Hero Section',
      kind: 'singleton',
      domain: 'marketing',
      i18n: true,
      title_field: 'title',
      fields: {
        title:      { type: 'string', required: true, max: 120, label: 'Title', order: 10 },
        subtitle:   { type: 'text', max: 280, label: 'Subtitle', order: 20 },
        cta_text:   { type: 'string', label: 'CTA text', order: 30 },
        cta_url:    { type: 'url', label: 'CTA URL', order: 40 },
        background: { type: 'image', label: 'Background', order: 50 },
      },
    },
    {
      id: 'features',
      name: 'Features',
      kind: 'singleton',
      domain: 'marketing',
      i18n: true,
      title_field: 'title',
      fields: {
        title:    { type: 'string', required: true, label: 'Title', order: 10 },
        subtitle: { type: 'text', label: 'Subtitle', order: 20 },
        items:    {
          type: 'array',
          items: {
            type: 'object',
            fields: {
              title:       { type: 'string', required: true, label: 'Title', order: 10 },
              description: { type: 'text', label: 'Description', order: 20 },
              icon:        { type: 'icon', label: 'Icon', order: 30 },
            },
          },
        },
      },
    },
    {
      id: 'pricing',
      name: 'Pricing Plans',
      kind: 'collection',
      domain: 'marketing',
      i18n: true,
      title_field: 'name',
      fields: {
        name:        { type: 'string', required: true, label: 'Name', order: 10 },
        price:       { type: 'number', required: true, label: 'Price', order: 20 },
        currency:    { type: 'string', default: 'USD', label: 'Currency', order: 30 },
        period:      { type: 'select', options: ['monthly', 'yearly'], label: 'Period', order: 40 },
        features:    { type: 'array', items: 'string', label: 'Features', order: 50 },
        highlighted: { type: 'boolean', default: false, label: 'Highlighted', order: 60 },
      },
    },
    {
      id: 'changelog',
      name: 'Changelog',
      kind: 'document',
      domain: 'product',
      i18n: true,
      title_field: 'title',
      fields: {
        title:        { type: 'string', required: true, label: 'Title', order: 10 },
        slug:         { type: 'slug', required: true, unique: true, label: 'Slug', order: 20 },
        version:      { type: 'string', label: 'Version', order: 30 },
        published_at: { type: 'date', label: 'Published at', order: 40 },
        tags:         { type: 'array', items: 'string', label: 'Tags', order: 50 },
      },
    },
    {
      id: 'faq',
      name: 'FAQ',
      kind: 'collection',
      domain: 'marketing',
      i18n: true,
      title_field: 'question',
      fields: {
        question: { type: 'string', required: true, label: 'Question', order: 10 },
        answer:   { type: 'text', required: true, label: 'Answer', order: 20 },
        order:    { type: 'integer', label: 'Order', order: 30 },
      },
    },
  ],
  sample_content: {
    hero: {
      en: {
        title: 'Ship faster with our platform',
        subtitle: 'Everything you need to build, deploy, and scale',
        cta_text: 'Start Free Trial',
        cta_url: '/signup',
      },
    },
    pricing: {
      en: {
        'plan-starter': { name: 'Starter', price: 0, currency: 'USD', period: 'monthly', features: ['Up to 3 projects', 'Community support'], highlighted: false },
        'plan-team': { name: 'Team', price: 49, currency: 'USD', period: 'monthly', features: ['Unlimited projects', 'Priority support', 'Team collaboration'], highlighted: true },
        'plan-enterprise': { name: 'Enterprise', price: 199, currency: 'USD', period: 'monthly', features: ['Everything in Team', 'SSO', 'SLA', 'Dedicated support'], highlighted: false },
      },
    },
  },
  vocabulary: {
    'start-free':   { en: 'Start Free Trial' },
    'contact-sales': { en: 'Contact Sales' },
    'per-month':     { en: '/month' },
    'changelog':     { en: 'Changelog' },
  },
}
