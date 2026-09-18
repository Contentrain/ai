// ─── Audit log ───
//
// One record per decision, whatever answered it: `decisions.jsonl`. It keeps
// the input's hash and never the input, so the log can be kept and shared
// without carrying what was decided about.

import { appendFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Decision, DecisionSource, FallbackReason } from './types.js'

export interface AuditRecord {
  /** ISO time the decision was made. */
  at: string
  tenant: string
  kind: string
  version: string
  /** The input hash — the same value as the cache key. */
  key: string
  choice?: string
  score?: number
  confidence: number
  source: DecisionSource
  proposed?: string
  unreviewed?: true
  fallback?: FallbackReason
  ms: number
  model?: string
  input_tokens?: number
  output_tokens?: number
  usd?: number
}

export interface AuditSink {
  write: (records: readonly AuditRecord[]) => Promise<void>
}

export function toAuditRecord(decision: Decision, at: string, tenant: string): AuditRecord {
  const record: AuditRecord = {
    at,
    tenant,
    kind: decision.kind,
    version: decision.version,
    key: decision.key,
    confidence: decision.confidence,
    source: decision.source,
    ms: decision.ms,
  }
  if (decision.choice !== undefined) record.choice = decision.choice
  if (decision.score !== undefined) record.score = decision.score
  if (decision.proposed !== undefined) record.proposed = decision.proposed
  if (decision.unreviewed) record.unreviewed = true
  if (decision.fallback) record.fallback = decision.fallback
  if (decision.model) record.model = decision.model
  if (decision.cost) {
    record.input_tokens = decision.cost.input_tokens
    record.output_tokens = decision.cost.output_tokens
    if (decision.cost.usd !== undefined) record.usd = decision.cost.usd
  }
  return record
}

export class MemoryAuditLog implements AuditSink {
  readonly records: AuditRecord[] = []

  async write(records: readonly AuditRecord[]): Promise<void> {
    this.records.push(...records)
  }
}

/** Appends to a JSONL file (conventionally `decisions.jsonl`), one line per decision. */
export class JsonlAuditLog implements AuditSink {
  constructor(readonly path: string) {}

  async write(records: readonly AuditRecord[]): Promise<void> {
    if (!records.length) return
    await mkdir(dirname(this.path), { recursive: true })
    await appendFile(this.path, records.map(record => `${JSON.stringify(record)}\n`).join(''))
  }
}
