// ─── punch_item: a migration run report's punch item → class + severity ───
//
// Migrate's run report lists what is left to finish on a migrated site. This
// kind labels each item with its root cause (class) and how much it matters
// (severity), as an advisory column beside the item — never as a gate.
//
// The class criteria and the severity rubric are PoC-1's, verbatim (Turkish,
// because the run report is): that wording is what was calibrated — 37/40
// class agreement and 39/40 severity within one level against hand labels,
// 12/12 classes stable over three repeats. Changing a word means bumping
// `version` and measuring again.

import type { JevAnswer, KindSpec, RuleVerdict } from '../types.js'
import { finite, scrubText } from './shape.js'

export const PUNCH_CLASSES = ['product_defect', 'source_limit', 'cosmetic', 'measurement'] as const
export type PunchClass = typeof PUNCH_CLASSES[number]

export const PUNCH_CLASS_CRITERIA: Record<PunchClass, string> = {
  product_defect: 'Migration engine\'in ürettiği çıktıda bir kusur/hata — üretilen sayfada bir şey yanlış (ör. yanlış görsel tekrar ediyor, bağlantı kırık, içerik markup\'ta eksik).',
  source_limit: 'Kaynak sitenin kendi yapısından gelen bir sınır — içerik zaten kaynakta veri olarak ayrıştırılamaz durumda (ör. tema markup\'ına gömülü, API\'de yok), migration engine bunu değiştiremez.',
  cosmetic: 'Teslimi engellemeyen küçük görsel fark — kullanıcı deneyimini gerçekten bozmayan, göz ardı edilebilir bir fark.',
  measurement: 'Ölçüm/araç belirsizliği — sorunun kendisi değil, ölçüm sürecinin (skor eşiği, örneklem, zaman aşımı) ne olduğunu net söyleyememesi.',
}

/** Severity rubric, levels 0–3 (Jev's score scale). Level n here is severity n+1 on a 1–4 scale. */
export const PUNCH_SEVERITY_CRITERIA = [
  'Teslimi engellemez — göz ardı edilebilir.',
  'Küçük, düşük öncelik — teslim edilebilir, sonra bakılabilir.',
  'Teslimden önce ele alınmalı — müşteri fark edebilir ama kesin reddetmez.',
  'Müşteri fark eder ve reddeder — teslim öncesi mutlaka çözülmeli.',
] as const

export interface PunchItemInput {
  /** The item's label in the run report, e.g. `(aile: post)` or a page slug. */
  label: string
  /** Why it is on the list, as the run report words it. */
  reason: string
  /** A link to the page. Never sent: the shaper drops it. */
  link?: string
  /** The site-level verdict the item sits under. */
  site?: { decision?: string, median?: number, mobile_median?: number }
}

export interface PunchItemShaped {
  label: string
  reason: string
  site?: { decision?: string, median?: number, mobile_median?: number }
}

export function shapePunchItem(input: PunchItemInput): PunchItemShaped {
  const shaped: PunchItemShaped = { label: scrubText(String(input.label ?? ''), 80), reason: scrubText(String(input.reason ?? ''), 300) }
  const site = input.site
  if (site) {
    const context: NonNullable<PunchItemShaped['site']> = {}
    if (typeof site.decision === 'string') context.decision = scrubText(site.decision, 40)
    const median = finite(site.median)
    const mobile = finite(site.mobile_median)
    if (median !== undefined) context.median = median
    if (mobile !== undefined) context.mobile_median = mobile
    if (Object.keys(context).length) shaped.site = context
  }
  return shaped
}

// Run-report phrasings whose class is not in doubt. Tentative only: a rule
// cannot place severity, so these answer only when Jev does not.
const SIGNATURES: ReadonlyArray<readonly [RegExp, PunchClass]> = [
  [/ölçülemedi|genellik kanıtlanmadı/i, 'measurement'],
  [/gövde yuvası yok|tam sayfa klon/i, 'source_limit'],
  [/hero sızıntısı|medya kaybı|dinamik liste bağlanmadı/i, 'product_defect'],
]

export function punchItemRule(input: PunchItemInput): RuleVerdict | undefined {
  const reason = String(input.reason ?? '')
  const hit = SIGNATURES.find(([pattern]) => pattern.test(reason))
  return hit ? { choice: hit[1], confidence: 1, final: false } : undefined
}

function renderPunchItem(item: PunchItemShaped): string {
  const parts = [`etiket="${item.label}"`, `neden="${item.reason}"`]
  if (item.site?.decision) parts.push(`site kararı="${item.site.decision}"`)
  if (item.site?.median !== undefined) parts.push(`site medyan skoru=${item.site.median}`)
  if (item.site?.mobile_median !== undefined) parts.push(`site mobil medyan=${item.site.mobile_median}`)
  return parts.join(', ')
}

function readPunchItem(answers: Record<string, JevAnswer>) {
  const cls = answers.class
  const severity = answers.severity
  if (cls?.type !== 'choice' || severity?.type !== 'score') return undefined
  return {
    choice: cls.choice,
    score: severity.score,
    confidence: Math.min(cls.confidence, severity.confidence),
    ...(cls.probabilities ? { probabilities: cls.probabilities } : {}),
  }
}

/** Jev's 0–3 severity score as a 1–4 level (PoC-1's hand-label scale). */
export const severityLevel = (score: number): number => Math.min(4, Math.max(1, Math.round(score) + 1))

export const punchItem: KindSpec<PunchItemInput, PunchItemShaped> = {
  kind: 'punch_item',
  version: '1',
  choices: PUNCH_CLASSES,
  scoreRange: [0, 3],
  shape: shapePunchItem,
  rule: punchItemRule,
  jev: {
    preamble: 'WordPress → Astro taşıma koşusunun bitirilecekler (punch) listesi. Her kalem, üretilen sitenin ölçümünden çıkan bir bulgu.',
    render: renderPunchItem,
    questions: {
      class: { type: 'choice', instructions: 'bu kalemin kök nedeni nedir?', criteria: PUNCH_CLASS_CRITERIA },
      severity: { type: 'score', instructions: 'bu kalem ne kadar ciddi?', criteria: PUNCH_SEVERITY_CRITERIA },
    },
    read: readPunchItem,
  },
}
