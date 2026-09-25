// ─── Migrate v3 fact-pack decisions: the narrow leftovers ───
//
// Migrate's fact pack settles most of a site deterministically: component
// identity from builder trees and repeated subtrees, content vs. interface text
// from cross-instance variance, field types from what the values say. Three
// questions are left, each over a closed set, each with a rule that answers
// the clear cases and a tentative answer for the rest:
//
//   - field_type:        a varying value whose type the value does not settle
//                        (string or text, relation or url, select or string)
//   - region_name:       what a top-level page section is (hero, card-grid, …)
//   - unmapped_element:  which kit component a builder element no mapping rule
//                        covers stands for, or `prose` / `site-specific`
//
// The fact pack already shapes these inputs (samples cut, e-mail addresses and
// phone numbers masked); the shapers here scrub again, so nothing depends on
// the producer being careful.

import type { JevAnswer, JevQuestion, KindSpec, RuleVerdict } from '../types.js'
import { scrubSlug, scrubText } from './shape.js'

const readChoice = (key: string) => (answers: Record<string, JevAnswer>) => {
  const answer = answers[key]
  if (answer?.type !== 'choice') return undefined
  return { choice: answer.choice, confidence: answer.confidence, ...(answer.probabilities ? { probabilities: answer.probabilities } : {}) }
}
const certain = (choice: string, confidence = 1): RuleVerdict => ({ choice, confidence, final: true })
const tentative = (choice: string, confidence = 0.5): RuleVerdict => ({ choice, confidence, final: false })

// ─── field_type ───────────────────────────────────────────────────────────────

/** The field types a fact-pack field_type decision can be between. */
export const FIELD_TYPE_CHOICES = ['string', 'text', 'markdown', 'richtext', 'relation', 'url', 'select'] as const
export type FieldTypeChoice = typeof FIELD_TYPE_CHOICES[number]

const FIELD_TYPE_CRITERIA: Record<FieldTypeChoice, string> = {
  string: 'A short single-line value: a title, a label, a name.',
  text: 'Plain multi-sentence text without formatting: an excerpt, a description.',
  markdown: 'Formatted prose (emphasis, links inside the text) an editor writes as Markdown.',
  richtext: 'Formatted prose that needs HTML an editor cannot express in Markdown (tables, embeds).',
  relation: 'A link to another entry of the same site (a post, a page, a term): it should follow that entry when its address changes.',
  url: 'An address kept as written: external, or a fixed internal path that is not an entry.',
  select: 'One of a few fixed values repeated across instances (a category label, a status, a size).',
}

export interface FieldTypeInput {
  tag: string
  prop: 'text' | 'href' | 'src' | 'alt' | 'datetime'
  inline?: boolean
  instances: number
  distinct: number
  maxLength: number
  samples: string[]
  /** The types this item may be answered with (a subset of FIELD_TYPE_CHOICES). */
  options: string[]
}

export interface FieldTypeShaped {
  tag: string
  prop: FieldTypeInput['prop']
  inline: boolean
  instances: number
  distinct: number
  max_length: number
  samples: string[]
  options: FieldTypeChoice[]
}

export function shapeFieldType(input: FieldTypeInput): FieldTypeShaped {
  const options = FIELD_TYPE_CHOICES.filter(choice => input.options.includes(choice))
  return {
    tag: scrubSlug(input.tag, 12),
    prop: input.prop,
    inline: Boolean(input.inline),
    instances: Math.max(0, Math.round(input.instances)),
    distinct: Math.max(0, Math.round(input.distinct)),
    max_length: Math.max(0, Math.round(input.maxLength)),
    samples: (input.samples ?? []).slice(0, 3).map(sample => scrubText(sample, 60)),
    options: options.length ? options : [...FIELD_TYPE_CHOICES],
  }
}

export function fieldTypeRule(input: FieldTypeInput): RuleVerdict | undefined {
  const f = shapeFieldType(input)
  const has = (a: FieldTypeChoice, b: FieldTypeChoice) => f.options.length === 2 && f.options.includes(a) && f.options.includes(b)
  if (has('string', 'text')) {
    if (f.max_length <= 100) return certain('string')
    if (f.max_length >= 200) return certain('text')
    return tentative(f.max_length > 140 ? 'text' : 'string')
  }
  if (has('select', 'string')) {
    if (f.instances >= 8 && f.distinct <= 3) return certain('select')
    return tentative(f.distinct <= 3 ? 'select' : 'string')
  }
  if (has('relation', 'url')) return tentative('relation', 0.6)
  if (f.options.length === 1) return certain(f.options[0]!)
  return undefined
}

export const fieldType: KindSpec<FieldTypeInput, FieldTypeShaped> = {
  kind: 'field_type',
  version: '1',
  choices: FIELD_TYPE_CHOICES,
  shape: shapeFieldType,
  rule: fieldTypeRule,
  jev: {
    // One request per option set, so the header can name the only valid answers.
    group: shaped => shaped.options.join('|'),
    header: shaped => `Values of repeated website components, migrated into a structured CMS. Each item is one value that differs between instances of the same component. Pick the field type that stores it. Valid types for every item in this request: ${shaped.options.join(', ')}.\n`,
    render: f => `<${f.tag}> ${f.prop}; ${f.instances} instances, ${f.distinct} distinct, longest ${f.max_length} chars${f.inline ? ', has inline formatting' : ''}; samples: ${f.samples.map(s => JSON.stringify(s)).join(' | ') || 'none'}`,
    questions: (prefix): Record<string, JevQuestion> => ({
      type: { type: 'choice', instructions: `${prefix}: which field type stores this value?`, criteria: FIELD_TYPE_CRITERIA },
    }),
    read: readChoice('type'),
    probe: { tag: 'p', prop: 'text', inline: false, instances: 12, distinct: 12, max_length: 160, samples: ['A short excerpt of a post that runs a little longer than a title.'], options: ['string', 'text'] },
  },
}

// ─── region_name ──────────────────────────────────────────────────────────────

export const REGION_CHOICES = ['header', 'nav', 'hero', 'main', 'footer', 'sidebar', 'cta', 'card-grid', 'features', 'faq', 'pricing', 'testimonials', 'logos', 'gallery', 'contact', 'newsletter', 'content', 'other'] as const
export type RegionChoice = typeof REGION_CHOICES[number]

const REGION_CRITERIA: Record<RegionChoice, string> = {
  'header': 'The site header: brand and primary navigation.',
  'nav': 'A navigation block on its own.',
  'hero': 'The large opening section of a page: headline, short text, often an image and a button.',
  'main': 'The main content wrapper of the page.',
  'footer': 'The site footer.',
  'sidebar': 'A side column next to the main content.',
  'cta': 'A call-to-action band: a short pitch and a button.',
  'card-grid': 'A grid or list of similar cards (posts, services, team members).',
  'features': 'A set of feature or benefit blocks, usually icon + title + text.',
  'faq': 'Questions and answers, often collapsible.',
  'pricing': 'Plans or packages with prices.',
  'testimonials': 'Quotes from customers with names.',
  'logos': 'A strip of client or partner logos.',
  'gallery': 'A set of images shown as a gallery.',
  'contact': 'Contact details or a contact form.',
  'newsletter': 'A newsletter sign-up.',
  'content': 'Ordinary page content: text, images, headings.',
  'other': 'None of the above.',
}

export interface RegionInput {
  tag: string
  classes?: string[]
  box?: [number, number, number, number]
  builder?: string | null
  children?: string[]
  images?: number
  links?: number
  headings?: number
  forms?: number
  text?: string
}

export interface RegionShaped {
  tag: string
  classes: string[]
  top: number
  width: number
  height: number
  builder: string | null
  children: string[]
  images: number
  links: number
  headings: number
  forms: number
  text: string
}

export function shapeRegion(input: RegionInput): RegionShaped {
  const [, y = 0, w = 0, h = 0] = input.box ?? []
  return {
    tag: scrubSlug(input.tag, 12),
    classes: (input.classes ?? []).slice(0, 6).map(c => scrubSlug(c)),
    // Rounded: layout scale is what matters, and exact pixels would split the cache.
    top: Math.round(y / 50) * 50,
    width: Math.round(w / 10) * 10,
    height: Math.round(h / 50) * 50,
    builder: input.builder ? scrubSlug(input.builder.replace('/', '-'), 40) : null,
    children: (input.children ?? []).slice(0, 12).map(c => scrubSlug(c.replace('/', '-'), 40)),
    images: input.images ?? 0,
    links: input.links ?? 0,
    headings: input.headings ?? 0,
    forms: input.forms ?? 0,
    text: scrubText(input.text ?? '', 120),
  }
}

const REGION_CLASS_HINTS: [RegExp, RegionChoice][] = [
  [/faq|accordion|toggle|details/, 'faq'],
  [/testimonial|review|quote/, 'testimonials'],
  [/pricing|price|plan/, 'pricing'],
  [/newsletter|subscribe|mailchimp|optin/, 'newsletter'],
  [/logo|client|partner|brand/, 'logos'],
  [/gallery|portfolio/, 'gallery'],
  [/cta|call-to-action/, 'cta'],
  [/hero|banner|cover|masthead/, 'hero'],
  [/feature|benefit|service/, 'features'],
]

export function regionRule(input: RegionInput): RuleVerdict | undefined {
  const r = shapeRegion(input)
  const words = `${r.classes.join(' ')} ${r.builder ?? ''} ${r.children.join(' ')}`
  for (const [re, choice] of REGION_CLASS_HINTS) if (re.test(words)) return tentative(choice, 0.7)
  if (r.forms > 0) return tentative(/subscri|newsletter|abone/i.test(r.text) ? 'newsletter' : 'contact', 0.6)
  const same = r.children.length >= 3 && r.children.every(c => c === r.children[0])
  if (same) return tentative('card-grid', 0.6)
  if (r.images >= 4 && r.headings <= 1 && r.text.length < 80) return tentative('gallery', 0.6)
  if (r.top <= 200 && r.headings >= 1 && r.height >= 300) return tentative('hero', 0.6)
  return tentative('content', 0.3)
}

export const regionName: KindSpec<RegionInput, RegionShaped> = {
  kind: 'region_name',
  version: '1',
  choices: REGION_CHOICES,
  shape: shapeRegion,
  rule: regionRule,
  jev: {
    header: () => 'Top-level sections of a website page, rebuilt as components. Each item is one section: its tag, classes, position, the kinds of its children and a scrubbed sample of its text. Name what the section is.\n',
    render: r => `<${r.tag}${r.classes.length ? ` class="${r.classes.join(' ')}"` : ''}> at y≈${r.top}, ${r.width}×${r.height}; builder=${r.builder ?? 'none'}; children: ${r.children.join(', ') || 'none'}; ${r.headings} headings, ${r.images} images, ${r.links} links, ${r.forms} forms; text: ${JSON.stringify(r.text)}`,
    questions: (prefix): Record<string, JevQuestion> => ({
      region: { type: 'choice', instructions: `${prefix}: what is this page section?`, criteria: REGION_CRITERIA },
    }),
    read: readChoice('region'),
    probe: { tag: 'section', classes: ['wp-block-cover'], top: 100, width: 1280, height: 600, builder: 'core-cover', children: ['h1', 'p', 'core-buttons'], images: 1, links: 1, headings: 1, forms: 0, text: 'Welcome to our studio' },
  },
}

// ─── unmapped_element ─────────────────────────────────────────────────────────

/** Kit component ids (astro-kit catalog, first fifteen) plus the two non-component answers. */
export const UNMAPPED_CHOICES = ['header', 'nav', 'footer', 'hero', 'card-grid', 'post-card', 'cta', 'faq', 'tabs', 'testimonial', 'gallery', 'slider', 'contact-form', 'pagination', 'breadcrumb', 'prose', 'site-specific'] as const
export type UnmappedChoice = typeof UNMAPPED_CHOICES[number]

const UNMAPPED_CRITERIA: Record<UnmappedChoice, string> = {
  'header': 'Site header with brand and navigation.',
  'nav': 'A navigation menu.',
  'footer': 'Site footer.',
  'hero': 'A large opening banner: headline, text, image, button.',
  'card-grid': 'A grid of cards or feature boxes (icon/image + title + text).',
  'post-card': 'One card for a blog post in a list.',
  'cta': 'A call-to-action box with a button.',
  'faq': 'Collapsible questions and answers (accordion, toggle).',
  'tabs': 'Tabbed panels.',
  'testimonial': 'A customer quote with a name.',
  'gallery': 'An image gallery.',
  'slider': 'A carousel or slider of slides.',
  'contact-form': 'A form visitors submit.',
  'pagination': 'Page navigation of a list.',
  'breadcrumb': 'A breadcrumb trail.',
  'prose': 'Plain content (text, a heading, an image, a spacer) that stays rich text, not a component.',
  'site-specific': 'Something no kit component covers; it is written for this site.',
}

export interface UnmappedInput {
  name: string
  builder: string
  count: number
  pages: number
  attrKeys?: string[]
}

export interface UnmappedShaped {
  name: string
  builder: string
  count: number
  pages: number
  attr_keys: string[]
}

export function shapeUnmapped(input: UnmappedInput): UnmappedShaped {
  return {
    name: scrubSlug(input.name.replace('/', '-'), 60),
    builder: scrubSlug(input.builder, 12),
    count: input.count,
    pages: input.pages,
    attr_keys: (input.attrKeys ?? []).slice(0, 20).map(k => scrubSlug(k, 40)),
  }
}

const UNMAPPED_NAME_HINTS: [RegExp, UnmappedChoice][] = [
  [/(^|-)(heading|text|paragraph|text-editor|image|spacer|divider|separator|html|shortcode|video|audio|icon)$/, 'prose'],
  [/accordion|toggle|faq|details/, 'faq'],
  [/slider|carousel|slideshow/, 'slider'],
  [/gallery|lightbox/, 'gallery'],
  [/testimonial|review/, 'testimonial'],
  [/tabs?$/, 'tabs'],
  [/form|contact|signup/, 'contact-form'],
  [/call-to-action|cta|promo/, 'cta'],
  [/blurb|icon-box|info-box|image-box|feature|card|team-member|service/, 'card-grid'],
  [/breadcrumb/, 'breadcrumb'],
  [/pagination|pager/, 'pagination'],
  [/posts|blog|query|post-grid|loop/, 'card-grid'],
  [/fullwidth-header|hero|banner|cover/, 'hero'],
  [/menu|nav/, 'nav'],
]

export function unmappedRule(input: UnmappedInput): RuleVerdict | undefined {
  const e = shapeUnmapped(input)
  for (const [re, choice] of UNMAPPED_NAME_HINTS) if (re.test(e.name)) return certain(choice, 0.9)
  return tentative('site-specific', 0.3)
}

export const unmappedElement: KindSpec<UnmappedInput, UnmappedShaped> = {
  kind: 'unmapped_element',
  version: '1',
  choices: UNMAPPED_CHOICES,
  shape: shapeUnmapped,
  rule: unmappedRule,
  jev: {
    group: shaped => shaped.builder,
    header: shaped => `Page-builder elements (${shaped.builder}) found on a WordPress site that is rebuilt from a component kit. Each item is one element type: its name, how often it appears and the names of its settings. Say which kit component it becomes, "prose" when it is plain content, or "site-specific" when no kit component fits.\n`,
    render: e => `${e.name}: ${e.count} uses on ${e.pages} pages; settings: ${e.attr_keys.join(', ') || 'none'}`,
    questions: (prefix): Record<string, JevQuestion> => ({
      component: { type: 'choice', instructions: `${prefix}: which kit component does this element become?`, criteria: UNMAPPED_CRITERIA },
    }),
    read: readChoice('component'),
    probe: { name: 'uagb-info-box', builder: 'gutenberg', count: 94, pages: 12, attr_keys: ['classes', 'settings'] },
  },
  lowConfidence: { threshold: 0.5, choice: 'site-specific' },
}
