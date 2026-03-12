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
      fields: {
        title:      { type: 'string', required: true, max: 120 },
        subtitle:   { type: 'text', max: 280 },
        cta_text:   { type: 'string' },
        cta_url:    { type: 'url' },
        background: { type: 'image' },
      },
    },
    {
      id: 'features',
      name: 'Features',
      kind: 'singleton',
      domain: 'marketing',
      i18n: true,
      fields: {
        title:    { type: 'string', required: true },
        subtitle: { type: 'text' },
        items:    {
          type: 'array',
          items: {
            type: 'object',
            fields: {
              title:       { type: 'string', required: true },
              description: { type: 'text' },
              icon:        { type: 'icon' },
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
      fields: {
        name:        { type: 'string', required: true },
        price:       { type: 'number', required: true },
        currency:    { type: 'string', default: 'USD' },
        period:      { type: 'select', options: ['monthly', 'yearly'] },
        features:    { type: 'array', items: 'string' },
        highlighted: { type: 'boolean', default: false },
      },
    },
    {
      id: 'changelog',
      name: 'Changelog',
      kind: 'document',
      domain: 'product',
      i18n: true,
      fields: {
        title:        { type: 'string', required: true },
        slug:         { type: 'slug', required: true, unique: true },
        version:      { type: 'string' },
        published_at: { type: 'date' },
        tags:         { type: 'array', items: 'string' },
      },
    },
    {
      id: 'faq',
      name: 'FAQ',
      kind: 'collection',
      domain: 'marketing',
      i18n: true,
      fields: {
        question: { type: 'string', required: true },
        answer:   { type: 'text', required: true },
        order:    { type: 'integer' },
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
