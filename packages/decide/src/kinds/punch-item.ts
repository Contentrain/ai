// ─── punch_item: a migration run report's punch item → class + severity ───
//
// Migrate's run report lists what is left to finish on a migrated site. This
// kind labels each item with its root cause (class) and how much it matters
// (severity), as an advisory column beside the item — never as a gate.
//
// The request is PoC-1's, word for word, because that is the shape that was
// measured: one request per site (at most 25 items), a three-line site header,
// `Item <n>: etiket=…, link=…, neden=…` lines, and three questions per item —
// class, severity and needs_human. needs_human is asked and not read: PoC-1
// found it unreliable, but dropping the question changed the other two
// answers. The one deliberate difference is privacy: the site's name, its URL
// and item links are sent as placeholders.
//
// Any change here changes `requestShapeHash(punchItem)`. The test pins that
// hash to the one in the latest `calibration/*.json`; a new shape needs a new
// live calibration (`pnpm calibration:live`) before it can ship.

import { createHash } from 'node:crypto'
import type { JevAnswer, JevQuestion, KindSpec, RuleVerdict } from '../types.js'
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
  /** A link to the page. Never sent: the request says only whether there is one. */
  link?: string
  /** The site the item belongs to. `name` and `url` only group items into one request and are never sent. */
  site?: { name?: string, url?: string, decision?: string, median?: number, mobile_median?: number }
}

export interface PunchItemShaped {
  label: string
  reason: string
  /** Whether the item has a link; the link itself is not kept. */
  linked: boolean
  site: {
    /** Opaque: a hash of the site's name or URL, so one site's items share a request. Never sent. */
    group: string
    decision: string | null
    median: number | null
    mobile_median: number | null
  }
}

export function shapePunchItem(input: PunchItemInput): PunchItemShaped {
  const site = input.site ?? {}
  const identity = site.name ?? site.url ?? ''
  return {
    label: scrubText(String(input.label ?? ''), 120),
    reason: scrubText(String(input.reason ?? ''), 500),
    linked: Boolean(input.link),
    site: {
      group: identity ? createHash('sha256').update(identity).digest('hex').slice(0, 16) : '',
      decision: typeof site.decision === 'string' ? scrubText(site.decision, 40) : null,
      median: finite(site.median) ?? null,
      mobile_median: finite(site.mobile_median) ?? null,
    },
  }
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

// PoC-1's `siteStateHeader`, with the site's name and URL as placeholders.
function punchHeader(item: PunchItemShaped): string {
  return `Site: <site> (<url>)\nGenel karar: ${item.site.decision}\nMedyan kalite skoru: ${item.site.median}, mobil: ${item.site.mobile_median}\n`
}

// PoC-1's `itemText`, after its `Item <n>: ` prefix.
function renderPunchItem(item: PunchItemShaped): string {
  return `etiket="${item.label}", link="${item.linked ? '<url>' : '(yok)'}", neden="${item.reason}"`
}

// PoC-1's `itemQuestions`.
function punchQuestions(prefix: string): Record<string, JevQuestion> {
  return {
    class: { type: 'choice', instructions: `${prefix} için: bu kalemin kök nedeni nedir?`, criteria: PUNCH_CLASS_CRITERIA },
    severity: { type: 'score', instructions: `${prefix} için: bu kalem ne kadar ciddi?`, criteria: PUNCH_SEVERITY_CRITERIA },
    needs_human: { type: 'noul', instructions: `${prefix} kalemi, teslim öncesi bir insanın karar vermesini gerektiriyor (otomatik/açık bir düzeltme değil, yargı gerektiriyor).` },
  }
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

// The prompt AO-9 measured Claude Haiku with, word for word: the same state
// and questions, in PoC-1's language, answered through a forced tool call.
function punchLlmPrompt({ state, questions, count }: { state: string, questions: Record<string, JevQuestion>, count: number }): string {
  const q = questions.class as Extract<JevQuestion, { type: 'choice' }>
  const s = questions.severity as Extract<JevQuestion, { type: 'score' }>
  const h = questions.needs_human!
  return [
    'Aşağıdaki durum bir WordPress → Astro taşıma koşusunun bitirilecekler listesinden bir sitenin kalemlerini içeriyor.',
    '',
    '<state>',
    state,
    '</state>',
    '',
    'Her kalem için üç soruyu yanıtla (itemN yerine kalem numarası):',
    `1) class — ${q.instructions.replace('item1', 'itemN')} Seçenekler:`,
    ...Object.entries(q.criteria).map(([k, v]) => `   - ${k}: ${v}`),
    `2) severity — ${s.instructions.replace('item1', 'itemN')} 0–3 arası tam sayı:`,
    ...s.criteria.map((c, n) => `   ${n}: ${c}`),
    `3) needs_human — önermenin doğru olma olasılığı (0–1): ${h.instructions.replace('item1', 'itemN')}`,
    '',
    `Tüm ${count} kalemi record_answers aracıyla, her kalem için bir kayıt olarak ver.`,
  ].join('\n')
}

/** Jev's 0–3 severity score as a 1–4 level (PoC-1's hand-label scale). */
export const severityLevel = (score: number): number => Math.min(4, Math.max(1, Math.round(score) + 1))

export const punchItem: KindSpec<PunchItemInput, PunchItemShaped> = {
  kind: 'punch_item',
  version: '2',
  choices: PUNCH_CLASSES,
  scoreRange: [0, 3],
  shape: shapePunchItem,
  rule: punchItemRule,
  jev: {
    header: punchHeader,
    group: item => item.site.group,
    render: renderPunchItem,
    questions: punchQuestions,
    read: readPunchItem,
    llmPrompt: punchLlmPrompt,
    // PoC-1's MAX_ITEMS_PER_CHUNK.
    batch: { maxItems: 25 },
    probe: {
      label: '(aile: post)',
      reason: 'en kötü sayfa 56.4 < 80 (5 sayfa ölçüldü)',
      linked: false,
      site: { group: 'probe', decision: 'KABUL + PUNCH LIST', median: 94.7, mobile_median: 83.9 },
    },
  },
}
