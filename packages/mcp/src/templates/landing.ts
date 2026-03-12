import type { ScaffoldTemplate } from '@contentrain/types'

export const landingTemplate: ScaffoldTemplate = {
  id: 'landing',
  models: [
    {
      id: 'hero',
      name: 'Hero Section',
      kind: 'singleton',
      domain: 'marketing',
      i18n: true,
      fields: {
        title:       { type: 'string', required: true, max: 120 },
        subtitle:    { type: 'text', max: 280 },
        cta_text:    { type: 'string' },
        cta_url:     { type: 'url' },
        background:  { type: 'image' },
      },
    },
    {
      id: 'features',
      name: 'Features Section',
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
    {
      id: 'testimonials',
      name: 'Testimonials',
      kind: 'collection',
      domain: 'marketing',
      i18n: true,
      fields: {
        name:    { type: 'string', required: true },
        role:    { type: 'string' },
        company: { type: 'string' },
        quote:   { type: 'text', required: true },
        avatar:  { type: 'image' },
        rating:  { type: 'rating' },
      },
    },
  ],
  sample_content: {
    hero: {
      en: {
        title: 'Build something amazing',
        subtitle: 'The fastest way to launch your product',
        cta_text: 'Get Started',
        cta_url: '/signup',
      },
    },
    pricing: {
      en: {
        'plan-free': { name: 'Free', price: 0, currency: 'USD', period: 'monthly', features: ['1 project', 'Basic support'], highlighted: false },
        'plan-pro': { name: 'Pro', price: 29, currency: 'USD', period: 'monthly', features: ['Unlimited projects', 'Priority support', 'Advanced analytics'], highlighted: true },
      },
    },
  },
  vocabulary: {
    'get-started':  { en: 'Get Started' },
    'learn-more':   { en: 'Learn More' },
    'per-month':    { en: '/month' },
    'most-popular': { en: 'Most Popular' },
  },
}
