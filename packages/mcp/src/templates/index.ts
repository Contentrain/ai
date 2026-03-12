import type { ScaffoldTemplate } from '@contentrain/types'
import { blogTemplate } from './blog.js'
import { landingTemplate } from './landing.js'
import { docsTemplate } from './docs.js'
import { ecommerceTemplate } from './ecommerce.js'
import { saasTemplate } from './saas.js'
import { i18nTemplate } from './i18n.js'
import { mobileTemplate } from './mobile.js'

const templates: Record<string, ScaffoldTemplate> = {
  blog: blogTemplate,
  landing: landingTemplate,
  docs: docsTemplate,
  ecommerce: ecommerceTemplate,
  saas: saasTemplate,
  i18n: i18nTemplate,
  mobile: mobileTemplate,
}

export function getTemplate(id: string): ScaffoldTemplate | null {
  return templates[id] ?? null
}

export function listTemplates(): string[] {
  return Object.keys(templates)
}
