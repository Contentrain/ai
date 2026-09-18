import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { JsonlAuditLog, MemoryAuditLog, toAuditRecord } from './audit.js'
import type { Decision } from './types.js'

const decision: Decision = {
  kind: 'punch_item', version: '1', key: 'a'.repeat(64), choice: 'product_defect', score: 2.1, confidence: 0.6,
  probabilities: { product_defect: 0.7 }, source: 'jev', ms: 312, model: 'jev-1.13.0', cost: { input_tokens: 80, output_tokens: 9, usd: 0.0001 },
}

describe('toAuditRecord', () => {
  it('keeps the hash, the answer, the source, time and cost', () => {
    expect(toAuditRecord(decision, '2026-09-18T10:00:00.000Z', 'acme')).toEqual({
      at: '2026-09-18T10:00:00.000Z', tenant: 'acme', kind: 'punch_item', version: '1', key: 'a'.repeat(64),
      choice: 'product_defect', score: 2.1, confidence: 0.6, source: 'jev', ms: 312, model: 'jev-1.13.0',
      input_tokens: 80, output_tokens: 9, usd: 0.0001,
    })
  })

  it('marks a fallback and omits what a rule answer does not have', () => {
    const record = toAuditRecord({ kind: 'eligibility_band', version: '1', key: 'b', confidence: 0.5, choice: 'eligible', source: 'rule', ms: 0, unreviewed: true, fallback: 'budget' }, 't', 'default')
    expect(record).toEqual({ at: 't', tenant: 'default', kind: 'eligibility_band', version: '1', key: 'b', choice: 'eligible', confidence: 0.5, source: 'rule', ms: 0, unreviewed: true, fallback: 'budget' })
  })
})

describe('audit sinks', () => {
  it('MemoryAuditLog collects records', async () => {
    const log = new MemoryAuditLog()
    await log.write([toAuditRecord(decision, 't', 'x')])
    expect(log.records.map(r => r.choice)).toEqual(['product_defect'])
  })

  it('JsonlAuditLog appends one line per record and writes nothing for none', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'decide-audit-')), 'run', 'decisions.jsonl')
    const log = new JsonlAuditLog(path)
    await log.write([])
    await log.write([toAuditRecord(decision, 't1', 'x'), toAuditRecord(decision, 't2', 'x')])
    await log.write([toAuditRecord(decision, 't3', 'x')])
    const lines = (await readFile(path, 'utf8')).trimEnd().split('\n').map(line => JSON.parse(line) as { at: string })
    expect(lines.map(line => line.at)).toEqual(['t1', 't2', 't3'])
  })
})
