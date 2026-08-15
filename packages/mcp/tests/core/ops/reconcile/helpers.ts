import type { ConflictResolution, ContextSource } from '@contentrain/types'
import type { RepoReader } from '../../../../src/core/contracts/index.js'
import type { ReconcilePlan } from '../../../../src/core/ops/reconcile/index.js'
import { planReconcile } from '../../../../src/core/ops/reconcile/index.js'

export type Files = Record<string, string>

/**
 * A `RepoReader` over a flat path→content map — the same hand-rolled shape
 * the other plan-level suites use, with `listDirectory` derived from the
 * key set (immediate children, directories included).
 */
export function treeReader(files: Files): RepoReader {
  const map = new Map(Object.entries(files))
  return {
    readFile: p => map.has(p)
      ? Promise.resolve(map.get(p)!)
      : Promise.reject(new Error(`ENOENT ${p}`)),
    listDirectory: (p) => {
      const prefix = p === '' ? '' : `${p.replace(/\/$/, '')}/`
      const names = new Set<string>()
      for (const key of map.keys()) {
        if (!key.startsWith(prefix)) continue
        const rest = key.slice(prefix.length)
        if (rest) names.add(rest.split('/')[0]!)
      }
      return Promise.resolve([...names].toSorted())
    },
    fileExists: (p) => {
      if (map.has(p)) return Promise.resolve(true)
      const prefix = `${p}/`
      for (const key of map.keys()) {
        if (key.startsWith(prefix)) return Promise.resolve(true)
      }
      return Promise.resolve(false)
    },
  }
}

export function reconcile(
  trees: { base: Files, ours: Files, theirs: Files },
  resolutions?: ConflictResolution[],
  source?: ContextSource,
): Promise<ReconcilePlan> {
  return planReconcile({
    base: treeReader(trees.base),
    ours: treeReader(trees.ours),
    theirs: treeReader(trees.theirs),
    resolutions,
    source,
  })
}

/** Plan changes minus the always-regenerated context.json. */
export function contentChanges(plan: ReconcilePlan): Array<{ path: string, content: string | null }> {
  return plan.changes.filter(c => c.path !== '.contentrain/context.json')
}

export const CONFIG = JSON.stringify({
  version: 1,
  stack: 'other',
  workflow: 'auto-merge',
  locales: { default: 'en', supported: ['en', 'tr'] },
  domains: ['site'],
})

export function faqModel(extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: 'faq',
    name: 'FAQ',
    kind: 'collection',
    domain: 'site',
    i18n: true,
    title_field: 'question',
    fields: {
      question: { type: 'text', required: true },
      answer: { type: 'text' },
    },
    ...extra,
  })
}

/** A minimal valid project skeleton every scenario builds on. */
export function project(files: Files): Files {
  return {
    '.contentrain/config.json': CONFIG,
    '.contentrain/models/faq.json': faqModel(),
    ...files,
  }
}

export const FAQ_EN = '.contentrain/content/site/faq/en.json'
export const FAQ_TR = '.contentrain/content/site/faq/tr.json'

export function entries(data: Record<string, Record<string, unknown>>): string {
  return JSON.stringify(data)
}
