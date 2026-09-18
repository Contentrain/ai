// ─── Decision cache ───
//
// A provider is asked about the same input once. The key is
// sha256(kind, schema version, canonical shaped input): the same shaped input
// under the same schema always maps to the same entry, and a schema bump
// retires every entry made under the old one. Only provider answers are
// cached — a rule answer is free to recompute and a fallback is not a decision
// anyone reviewed.
//
// The stores here are for a single process (memory) and for a run directory
// (append-only JSONL). A database store is the host's: implement
// `DecisionCache` over it.

import { createHash } from 'node:crypto'
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { canonicalStringify } from '@contentrain/types'
import type { Decision } from './types.js'

/** What a cache keeps of a decision: the answer, never the input. */
export type CachedDecision = Pick<Decision, 'kind' | 'version' | 'choice' | 'score' | 'confidence' | 'probabilities' | 'proposed' | 'model'> & {
  source: 'jev' | 'llm'
  /** ISO time the provider answered. */
  at: string
}

export interface DecisionCache {
  get: (key: string) => Promise<CachedDecision | undefined>
  set: (key: string, value: CachedDecision) => Promise<void>
}

export function cacheKey(kind: string, version: string, shaped: unknown): string {
  return createHash('sha256').update(`${kind}\n${version}\n${canonicalStringify(shaped)}`).digest('hex')
}

export class MemoryDecisionCache implements DecisionCache {
  private readonly entries = new Map<string, CachedDecision>()

  get size(): number {
    return this.entries.size
  }

  async get(key: string): Promise<CachedDecision | undefined> {
    return this.entries.get(key)
  }

  async set(key: string, value: CachedDecision): Promise<void> {
    this.entries.set(key, value)
  }
}

/**
 * One `{"key","value"}` line per answer, appended. Read once, on first use;
 * a later line for the same key wins. A torn last line (a crash mid-append) is
 * skipped rather than failing the run — the answer is asked for again.
 */
export class JsonlDecisionCache implements DecisionCache {
  private loaded: Promise<Map<string, CachedDecision>> | undefined

  constructor(readonly path: string) {}

  private load(): Promise<Map<string, CachedDecision>> {
    this.loaded ??= readFile(this.path, 'utf8').then(
      text => readCacheLines(text),
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return new Map<string, CachedDecision>()
        throw error
      },
    )
    return this.loaded
  }

  async get(key: string): Promise<CachedDecision | undefined> {
    return (await this.load()).get(key)
  }

  async set(key: string, value: CachedDecision): Promise<void> {
    const entries = await this.load()
    entries.set(key, value)
    await mkdir(dirname(this.path), { recursive: true })
    await appendFile(this.path, `${JSON.stringify({ key, value })}\n`)
  }
}

function readCacheLines(text: string): Map<string, CachedDecision> {
  const entries = new Map<string, CachedDecision>()
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      const { key, value } = JSON.parse(line) as { key?: unknown, value?: CachedDecision }
      if (typeof key === 'string' && value && typeof value === 'object') entries.set(key, value)
    }
    catch {
      // torn line — see the class comment
    }
  }
  return entries
}
