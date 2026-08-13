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
      title_field: 'title',
      fields: {
        title:       { type: 'string', required: true, max: 120, label: 'Title', order: 10 },
        subtitle:    { type: 'text', max: 280, label: 'Subtitle', order: 20 },
        cta_text:    { type: 'string', label: 'CTA text', order: 30 },
        cta_url:     { type: 'url', label: 'CTA URL', order: 40 },
        background:  { type: 'image', label: 'Background', order: 50 },
      },
    },
    {
      id: 'features',
      name: 'Features Section',
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
    {
      id: 'testimonials',
      name: 'Testimonials',
      kind: 'collection',
      domain: 'marketing',
      i18n: true,
      title_field: 'name',
      fields: {
        name:    { type: 'string', required: true, label: 'Name', order: 10 },
        role:    { type: 'string', label: 'Role', order: 20 },
        company: { type: 'string', label: 'Company', order: 30 },
        quote:   { type: 'text', required: true, label: 'Quote', order: 40 },
        avatar:  { type: 'image', label: 'Avatar', order: 50 },
        rating:  { type: 'rating', label: 'Rating', order: 60 },
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
