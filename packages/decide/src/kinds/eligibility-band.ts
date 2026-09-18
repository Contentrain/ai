// ─── eligibility_band: the undecided band of Migrate's eligibility verdict ───
//
// Migrate's `judgeEligibility` sorts a discovered site into eligible /
// page_only / custom_type / access_blocked from public discovery counts. Most
// sites are clear. Two bands are not, and those — only those — go to Jev:
//
//   - posts and custom-type entries within a factor of two of each other: is
//     the content the posts, or the custom types?
//   - exactly one sampled post: a blog of one, or a brochure site with a stray
//     "Hello world"?
//
// The rule mirrors judgeEligibility's thresholds (MIN_POSTS = 2) so the clear
// cases never reach a provider; a host with its own verdict function passes it
// as `options.rule`. A Jev answer under 0.5 confidence becomes `needs_human`,
// which is never offered to Jev as a choice.

import type { JevAnswer, KindSpec, RuleVerdict } from '../types.js'
import { scrubSlug } from './shape.js'

export const ELIGIBILITY_CHOICES = ['eligible', 'access_blocked', 'page_only', 'custom_type'] as const
export type EligibilityChoice = typeof ELIGIBILITY_CHOICES[number]
export const NEEDS_HUMAN = 'needs_human'

/** Migrate's `EligibilityInput`, as discovery produces it. */
export interface EligibilityBandInput {
  access: 'open' | 'bot_wall' | 'unreachable'
  rest: {
    reachable: boolean
    counts: { posts: number | null, pages: number | null }
    postTypes: Array<{ slug: string, count?: number | null }>
    /** Sampled records. Only how many there are is used — their content never leaves. */
    samples: { posts: unknown[], pages: unknown[] }
  }
}

export interface EligibilityBandShaped {
  access: EligibilityBandInput['access']
  rest_reachable: boolean
  posts: number | null
  pages: number | null
  post_samples: number
  page_samples: number
  custom_types: Array<{ slug: string, count: number }>
}

const MIN_POSTS = 2
/** Posts and custom entries within this factor of each other are the band. */
const BAND_FACTOR = 2

export function shapeEligibility(input: EligibilityBandInput): EligibilityBandShaped {
  const rest = input.rest
  const counts = new Map<string, number>()
  for (const type of rest.postTypes ?? []) {
    if (type.slug === 'post' || type.slug === 'page' || !((type.count ?? 0) > 0)) continue
    const slug = scrubSlug(type.slug)
    counts.set(slug, (counts.get(slug) ?? 0) + (type.count ?? 0))
  }
  return {
    access: input.access,
    rest_reachable: Boolean(rest.reachable),
    posts: rest.counts?.posts ?? null,
    pages: rest.counts?.pages ?? null,
    post_samples: rest.samples?.posts?.length ?? 0,
    page_samples: rest.samples?.pages?.length ?? 0,
    custom_types: [...counts].map(([slug, count]) => ({ slug, count })).toSorted((a, b) => a.slug.localeCompare(b.slug)),
  }
}

const certain = (choice: EligibilityChoice): RuleVerdict => ({ choice, confidence: 1, final: true })
const tentative = (choice: EligibilityChoice): RuleVerdict => ({ choice, confidence: 0.5, final: false })

export function eligibilityRule(input: EligibilityBandInput): RuleVerdict {
  const site = shapeEligibility(input)
  if (site.access !== 'open' || !site.rest_reachable) return certain('access_blocked')
  const postCount = site.posts ?? site.post_samples
  const customCount = site.custom_types.reduce((sum, type) => sum + type.count, 0)
  const pages = site.page_samples || (site.pages ?? 0)

  if (site.post_samples >= MIN_POSTS) {
    const verdict: EligibilityChoice = customCount <= postCount ? 'eligible' : 'custom_type'
    const close = customCount > 0 && customCount * BAND_FACTOR >= postCount && postCount * BAND_FACTOR >= customCount
    return close ? tentative(verdict) : certain(verdict)
  }
  const verdict: EligibilityChoice = site.custom_types.length ? 'custom_type' : pages ? 'page_only' : 'access_blocked'
  return site.post_samples === 1 ? tentative(verdict) : certain(verdict)
}

function renderEligibility(site: EligibilityBandShaped): string {
  const custom = site.custom_types.length ? site.custom_types.map(type => `${type.slug}=${type.count}`).join(', ') : 'none'
  return [
    `access=${site.access}`,
    `rest=${site.rest_reachable ? 'reachable' : 'unreachable'}`,
    `posts=${site.posts ?? 'unknown'} (sampled ${site.post_samples})`,
    `pages=${site.pages ?? 'unknown'} (sampled ${site.page_samples})`,
    `custom post types: ${custom}`,
  ].join('; ')
}

function readEligibility(answers: Record<string, JevAnswer>) {
  const answer = answers.eligibility
  if (answer?.type !== 'choice') return undefined
  return { choice: answer.choice, confidence: answer.confidence, ...(answer.probabilities ? { probabilities: answer.probabilities } : {}) }
}

export const eligibilityBand: KindSpec<EligibilityBandInput, EligibilityBandShaped> = {
  kind: 'eligibility_band',
  version: '1',
  choices: ELIGIBILITY_CHOICES,
  shape: shapeEligibility,
  rule: eligibilityRule,
  jev: {
    preamble: 'WordPress sites considered for migration. Each item is what a public discovery scan counted on one site. The migration engine moves standard posts and pages only.',
    render: renderEligibility,
    questions: {
      eligibility: {
        type: 'choice',
        instructions: 'where does this site\'s content live, and can the engine move it?',
        criteria: {
          eligible: 'Standard blog posts carry the site\'s content; moving posts and pages moves what matters.',
          custom_type: 'The content lives mainly in custom post types (products, portfolio, members); moving posts and pages alone leaves it behind.',
          page_only: 'No real blog: a corporate or brochure site whose content is its pages.',
          access_blocked: 'What the scan could see is not the site\'s real content; authorized access is needed to reach it.',
        },
      },
    },
    read: readEligibility,
  },
  lowConfidence: { threshold: 0.5, choice: NEEDS_HUMAN },
}
