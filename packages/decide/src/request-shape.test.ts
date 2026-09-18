// The request each kind sends, pinned. A calibration holds only for the exact
// request that was measured, and nothing in CI asks Jev, so this is where a
// drifted prompt is caught: any change to a header, a line, a question, a
// criterion, a batch limit or the model fails here first.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDecider } from './decide.js'
import { createJevProvider, requestShapeHash } from './jev.js'
import { eligibilityBand } from './kinds/eligibility-band.js'
import { punchItem } from './kinds/punch-item.js'
import { ENV, eligibilityAnswer, punchAnswer, scriptedFetch, site } from './test-support.js'

// PoC-1's lib.mjs, as run on 2026-09-18, with its three identifying values
// (site name, site URL, item link) as the placeholders this package sends.
const POC1_CLASS_CRITERIA = {
  product_defect: 'Migration engine\'in ürettiği çıktıda bir kusur/hata — üretilen sayfada bir şey yanlış (ör. yanlış görsel tekrar ediyor, bağlantı kırık, içerik markup\'ta eksik).',
  source_limit: 'Kaynak sitenin kendi yapısından gelen bir sınır — içerik zaten kaynakta veri olarak ayrıştırılamaz durumda (ör. tema markup\'ına gömülü, API\'de yok), migration engine bunu değiştiremez.',
  cosmetic: 'Teslimi engellemeyen küçük görsel fark — kullanıcı deneyimini gerçekten bozmayan, göz ardı edilebilir bir fark.',
  measurement: 'Ölçüm/araç belirsizliği — sorunun kendisi değil, ölçüm sürecinin (skor eşiği, örneklem, zaman aşımı) ne olduğunu net söyleyememesi.',
}
const POC1_SEVERITY_CRITERIA = [
  'Teslimi engellemez — göz ardı edilebilir.',
  'Küçük, düşük öncelik — teslim edilebilir, sonra bakılabilir.',
  'Teslimden önce ele alınmalı — müşteri fark edebilir ama kesin reddetmez.',
  'Müşteri fark eder ve reddeder — teslim öncesi mutlaka çözülmeli.',
]
const poc1Questions = (prefix: string) => ({
  [`${prefix}_class`]: { type: 'choice', instructions: `${prefix} için: bu kalemin kök nedeni nedir?`, criteria: POC1_CLASS_CRITERIA },
  [`${prefix}_severity`]: { type: 'score', instructions: `${prefix} için: bu kalem ne kadar ciddi?`, criteria: POC1_SEVERITY_CRITERIA },
  [`${prefix}_needs_human`]: { type: 'noul', instructions: `${prefix} kalemi, teslim öncesi bir insanın karar vermesini gerektiriyor (otomatik/açık bir düzeltme değil, yargı gerektiriyor).` },
})

const siteA = { name: 'site-a', url: 'https://a.example', decision: 'KABUL + PUNCH LIST', median: 94.7, mobile_median: 83.9 }
const siteB = { name: 'site-b', url: 'https://b.example', decision: 'İNSAN GEREKLİ', median: 61, mobile_median: 58.2 }

describe('punch_item request shape', () => {
  it('is PoC-1\'s request, with placeholders for the site and the links', async () => {
    const { fetch, calls } = scriptedFetch(() => punchAnswer('measurement', 1))
    await createDecider({ jev: createJevProvider({ env: ENV, fetch }) }).decideMany('punch_item', [
      { label: '(aile: post)', reason: 'en kötü sayfa 56.4 < 80 (5 sayfa ölçüldü)', site: siteA },
      { label: 'ace-combat-8', reason: 'mobil 76.3 < 85', link: 'https://a.example/2026/ace/', site: siteA },
    ], { rule: null })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.body.model).toBe('jev-latest')
    expect(calls[0]!.body.state).toBe([
      'Site: <site> (<url>)',
      'Genel karar: KABUL + PUNCH LIST',
      'Medyan kalite skoru: 94.7, mobil: 83.9',
      'Item 1: etiket="(aile: post)", link="(yok)", neden="en kötü sayfa 56.4 < 80 (5 sayfa ölçüldü)"',
      'Item 2: etiket="ace-combat-8", link="<url>", neden="mobil 76.3 < 85"',
    ].join('\n'))
    expect(calls[0]!.body.questions).toEqual({ ...poc1Questions('item1'), ...poc1Questions('item2') })
    expect(JSON.stringify(Object.keys(calls[0]!.body.questions))).toBe(JSON.stringify([...Object.keys(poc1Questions('item1')), ...Object.keys(poc1Questions('item2'))]))
  })

  it('sends one site per request, at most 25 items each, in the caller\'s order', async () => {
    const { fetch, calls } = scriptedFetch(() => punchAnswer('measurement', 1))
    const inputs = [
      ...Array.from({ length: 49 }, (_, i) => ({ label: `a${i}`, reason: 'r', site: siteA })),
      { label: 'b0', reason: 'r', site: siteB },
    ]
    // Interleave B's item among A's: it still goes in its own request.
    inputs.splice(10, 0, inputs.pop()!)
    await createDecider({ jev: createJevProvider({ env: ENV, fetch }) }).decideMany('punch_item', inputs, { rule: null, fold: false })
    expect(calls.map(call => Object.keys(call.body.questions).length / 3)).toEqual([25, 24, 1])
    expect(calls[2]!.body.state.startsWith('Site: <site> (<url>)\nGenel karar: İNSAN GEREKLİ\n')).toBe(true)
    expect(calls[0]!.body.state.split('\n')[13]).toBe('Item 11: etiket="a10", link="(yok)", neden="r"')
  })

  it('fold: false keeps a repeated item as its own numbered item', async () => {
    const { fetch, calls } = scriptedFetch(() => punchAnswer('measurement', 1))
    const decider = createDecider({ jev: createJevProvider({ env: ENV, fetch }) })
    const same = { label: 'x', reason: 'r', site: siteA }
    await decider.decideMany('punch_item', [same, same], { rule: null, fold: false, noCache: true })
    await decider.decideMany('punch_item', [same, same], { rule: null, noCache: true })
    expect(calls.map(call => Object.keys(call.body.questions).length / 3)).toEqual([2, 1])
  })

  it('the shape hash is the one the latest live calibration measured', () => {
    const dir = join(import.meta.dirname, '../calibration')
    const latest = readdirSync(dir).filter(name => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).toSorted().at(-1)!
    const record = JSON.parse(readFileSync(join(dir, latest), 'utf8')) as { kind: string, version: string, shape: string, gate: { passed: boolean } }
    expect(record).toMatchObject({ kind: 'punch_item', version: punchItem.version, shape: requestShapeHash(punchItem) })
    expect(record.gate.passed).toBe(true)
  })

  it('changes with the model and with the prompt', () => {
    const base = requestShapeHash(punchItem)
    expect(base).toMatch(/^[0-9a-f]{16}$/)
    expect(requestShapeHash(punchItem, 'jev-1.13.0')).not.toBe(base)
    expect(requestShapeHash({ ...punchItem, jev: { ...punchItem.jev!, batch: { maxItems: 32 } } })).not.toBe(base)
    expect(requestShapeHash({ ...punchItem, jev: { ...punchItem.jev!, render: item => `etiket="${item.label}"` } })).not.toBe(base)
    expect(requestShapeHash({ ...punchItem, jev: undefined })).toBe('none')
  })
})

describe('eligibility_band request shape', () => {
  it('sends counts and scrubbed type slugs, nothing from the sampled records', async () => {
    const { fetch, calls } = scriptedFetch(() => eligibilityAnswer('eligible', 0.9))
    const input = site(20, [['Members Directory', 30]])
    input.rest.samples.posts = input.rest.samples.posts.map((_, i) => ({ title: `Jane Doe's secret post ${i}`, link: `https://private.example/p/${i}`, author: 'jane@private.example' }))
    await createDecider({ jev: createJevProvider({ env: ENV, fetch }) }).decide('eligibility_band', input)
    const body = JSON.stringify(calls[0]!.body)
    expect(calls[0]!.body.state.split('\n')[1]).toBe('Item 1: access=open; rest=reachable; posts=20 (sampled 5); pages=3 (sampled 3); custom post types: members-directory=30')
    for (const leak of ['Jane', 'secret', 'private.example', '@', 'Members Directory']) expect(body).not.toContain(leak)
    expect(Object.keys(calls[0]!.body.questions)).toEqual(['item1_eligibility'])
    expect(requestShapeHash(eligibilityBand)).toMatch(/^[0-9a-f]{16}$/)
  })
})
