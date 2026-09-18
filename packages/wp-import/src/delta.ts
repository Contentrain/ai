// SourceDeltaPlan (as a bridge produces it) + the repository's store → a plan
// a person can review: every origin record placed in the store, or said to be
// unplaceable and why.
//
// The bridge knows what changed at the origin and nothing about the store; the
// store knows its entries and nothing about the origin. The EntrySourceMap
// written at import time is the only link, so this module lives next to the
// code that writes it. Pure over file maps, like `rawToContentrain`: no git,
// no provider, and nothing is written — applying a plan is a governed write
// that belongs to whoever reviews it.
//
// What the planner refuses to do is decide. A record the repository also
// edited is flagged, not overwritten; a trashed record stays distinguishable
// from a purged one; a record it cannot place says why instead of vanishing.

import type { EntryMeta, EntrySourceMap, ModelDefinition, SourceDeltaEntry, SourceDeltaPlan } from '@contentrain/types'
import { canon, taxModelId } from './core.js'

/** A `.contentrain` store as a file map (repo-relative path → file text), with the source map it was built from. */
export interface DeltaStore {
  files: Record<string, string>
  entry_source_map: EntrySourceMap
}

export interface PlanSourceDeltaInput {
  /** The origin delta, as the bridge wrote it. */
  delta: SourceDeltaPlan
  /** The repository's store, as it is now — including edits made since the import. */
  store: DeltaStore
  /** The new export the delta describes. Without it the plan has no field-level differences and no address for a created record. */
  incoming?: DeltaStore
  /**
   * Origin types that are taxonomies. Their ids are term ids, which the
   * source map (post ids) must never be consulted for: post 6 and category 6
   * are different records. Defaults to WordPress core's.
   */
  taxonomies?: string[]
  /**
   * `updated_by` values that mean "written by an import". Meta with any other
   * writer — or with a `source` other than `import` — is a repository edit.
   */
  importers?: string[]
}

export const DEFAULT_TAXONOMIES = ['category', 'post_tag', 'nav_menu', 'post_format'] as const
export const DEFAULT_IMPORTERS = ['contentrain-bridge', '@contentrain/wp-import'] as const

interface Placed {
  model: ModelDefinition
  entry_id: string
  locale: string
}

type Placement = Placed | { unmapped: NonNullable<SourceDeltaEntry['unmapped']> }

/** A stored entry, reduced to what a comparison needs: each field's value as text, and its meta. */
interface StoredEntry {
  fields: Record<string, string>
  meta?: EntryMeta
}

// ─── Store reading ───

const parseJson = (text: string | undefined): unknown => {
  if (text === undefined) return undefined
  try {
    return JSON.parse(text)
  }
  catch {
    return undefined
  }
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined

function readModel(files: Record<string, string>, id: string): ModelDefinition | undefined {
  const model = asRecord(parseJson(files[`.contentrain/models/${id}.json`]))
  return model && model.id === id ? (model as unknown as ModelDefinition) : undefined
}

function defaultLocale(files: Record<string, string>): string {
  const config = asRecord(parseJson(files['.contentrain/config.json']))
  const locales = asRecord(config?.locales)
  return typeof locales?.default === 'string' ? locales.default : 'en'
}

/** The model's own directory. A custom `content_path` or locale strategy is not read — the entry is reported as not found. */
const contentDir = (model: ModelDefinition): string | undefined =>
  model.content_path || (model.locale_strategy && model.locale_strategy !== 'file')
    ? undefined
    : `.contentrain/content/${model.domain}/${model.id}`

/**
 * A markdown document's fields as raw text: each top-level frontmatter key
 * with its value lines (a list's items included), and `body`. Compared as
 * written — the store is canonical, so equal values are equal text.
 */
function documentFields(text: string): Record<string, string> {
  const fields: Record<string, string> = {}
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text)
  if (!match) return { body: text }
  let key: string | undefined
  for (const line of match[1]!.split('\n')) {
    const top = /^([^\s:#][^:]*):(.*)$/.exec(line)
    if (top) {
      key = top[1]!.trim()
      fields[key] = top[2]!.trim()
    }
    else if (key !== undefined) {
      fields[key] += `\n${line}`
    }
  }
  fields.body = match[2]!
  return fields
}

function readEntry(files: Record<string, string>, at: Placed): StoredEntry | undefined {
  const { model, entry_id: id, locale } = at
  const dir = contentDir(model)
  if (!dir) return undefined
  if (model.kind === 'document') {
    const text = files[model.i18n ? `${dir}/${id}/${locale}.md` : `${dir}/${id}.md`]
    if (text === undefined) return undefined
    const meta = asRecord(parseJson(files[`.contentrain/meta/${model.id}/${id}/${locale}.json`]))
    return { fields: documentFields(text), meta: meta as EntryMeta | undefined }
  }
  if (model.kind !== 'collection') return undefined
  const entries = asRecord(parseJson(files[`${dir}/${model.i18n ? locale : 'data'}.json`]))
  const entry = asRecord(entries?.[id])
  if (!entry) return undefined
  const metas = asRecord(parseJson(files[`.contentrain/meta/${model.id}/${locale}.json`]))
  const fields = Object.fromEntries(Object.entries(entry).map(([key, value]) => [key, canon(value)]))
  return { fields, meta: asRecord(metas?.[id]) as EntryMeta | undefined }
}

/** The entry in `model` whose `wp_id` is `wpId`, for records the source map does not list (terms, media). */
function findByWpId(files: Record<string, string>, model: ModelDefinition, wpId: number, locale: string): string | undefined {
  const dir = contentDir(model)
  if (!dir) return undefined
  if (model.kind === 'collection') {
    const entries = asRecord(parseJson(files[`${dir}/${model.i18n ? locale : 'data'}.json`])) ?? {}
    return Object.keys(entries).find(id => asRecord(entries[id])?.wp_id === wpId)
  }
  if (model.kind !== 'document') return undefined
  const suffix = model.i18n ? `/${locale}.md` : '.md'
  for (const [path, text] of Object.entries(files)) {
    if (!path.startsWith(`${dir}/`) || !path.endsWith(suffix)) continue
    if (documentFields(text).wp_id === String(wpId)) {
      const rest = path.slice(dir.length + 1, -suffix.length)
      if (!rest.includes('/')) return rest
    }
  }
  return undefined
}

/** Store models that can hold records of an origin type the source map does not cover. */
function typeModelIds(wpType: string): string[] {
  if (wpType === 'attachment') return ['wp-media', 'media']
  return [`wp-tax-${wpType.replace(/_/g, '-')}`, taxModelId(wpType)]
}

function place(store: DeltaStore, wpType: string | undefined, wpId: number, taxonomies: Set<string>): Placement {
  const { files } = store
  const locale = defaultLocale(files)
  const models = wpType ? typeModelIds(wpType).map(id => readModel(files, id)).filter(model => model !== undefined) : []
  // A listed taxonomy, media, or any type the store has a model of its own for
  // is found by `wp_id` in that model. Only what is left falls to the map.
  if (wpType && (wpType === 'attachment' || taxonomies.has(wpType) || models.length)) {
    if (!models.length) return { unmapped: 'no-model-for-type' }
    for (const model of models) {
      const entryId = findByWpId(files, model, wpId, locale)
      if (entryId) return { model, entry_id: entryId, locale }
    }
    return { unmapped: 'entry-not-found' }
  }
  const ref = store.entry_source_map[String(wpId)]
  if (!ref) return { unmapped: 'not-in-source-map' }
  const model = readModel(files, ref.model_id)
  if (!model) return { unmapped: 'no-model-for-type' }
  return { model, entry_id: ref.entry_id, locale: ref.locale ?? locale }
}

// ─── Planning ───

const isPlaced = (placement: Placement): placement is Placed => 'model' in placement

function repoEdit(meta: EntryMeta | undefined, importers: Set<string>): SourceDeltaEntry['repo_edit'] {
  if (!meta) return undefined
  if (meta.source === 'import' && importers.has(meta.updated_by)) return undefined
  return {
    updated_by: meta.updated_by,
    ...(meta.updated_at ? { updated_at: meta.updated_at } : {}),
    source: meta.source,
  }
}

function changedFields(before: StoredEntry, after: StoredEntry): string[] {
  const keys = new Set([...Object.keys(before.fields), ...Object.keys(after.fields)])
  return [...keys].filter(key => before.fields[key] !== after.fields[key]).toSorted()
}

const DELETED_DETAIL = {
  trashed: 'tombstone: trashed at the origin — it can still come back',
  purged: 'tombstone: purged from the origin',
} as const

function planEntry(entry: SourceDeltaEntry, input: PlanSourceDeltaInput, taxonomies: Set<string>, importers: Set<string>): SourceDeltaEntry {
  const { store, incoming } = input
  const out: SourceDeltaEntry = { ...entry }
  // The bridge's detail for a deletion is the kind itself; the tombstone note below says it in full.
  const notes: string[] = entry.detail && entry.detail !== entry.deleted_kind ? [entry.detail] : []

  // A created record is not in the store yet; its address comes from the export that carries it.
  const target = entry.op === 'created'
    ? (incoming ? place(incoming, entry.wp_type, entry.wp_id, taxonomies) : { unmapped: 'not-in-source-map' as const })
    : place(store, entry.wp_type, entry.wp_id, taxonomies)

  if (!isPlaced(target)) {
    out.unmapped = target.unmapped
    if (entry.op === 'created' && !incoming) notes.push('no incoming export to place it')
    if (entry.op === 'deleted' && entry.deleted_kind) notes.push(DELETED_DETAIL[entry.deleted_kind])
    out.detail = notes.join('; ')
    return out
  }

  out.model = target.model.id
  out.entry_id = target.entry_id
  out.locale = target.locale
  const stored = readEntry(store.files, target)

  if (entry.op === 'created') {
    if (stored) notes.push('the store already has an entry at this address')
  }
  else if (!stored) {
    out.unmapped = 'entry-not-found'
  }

  if (entry.op === 'deleted' && entry.deleted_kind) notes.push(DELETED_DETAIL[entry.deleted_kind])

  if ((entry.op === 'updated' || entry.op === 'moved') && stored) {
    const after = incoming ? place(incoming, entry.wp_type, entry.wp_id, taxonomies) : undefined
    const next = after && isPlaced(after) ? readEntry(incoming!.files, after) : undefined
    if (next) {
      out.fields_changed = changedFields(stored, next)
      if (isPlaced(after!) && after.entry_id !== target.entry_id) out.entry_id_after = after.entry_id
    }
    else {
      notes.push(incoming ? 'not in the incoming export' : 'no incoming export to compare with')
    }
  }

  const edit = repoEdit(stored?.meta, importers)
  if (edit) {
    out.conflict = true
    out.repo_edit = edit
    notes.push(`also edited in the repository by ${edit.updated_by}${edit.updated_at ? ` at ${edit.updated_at}` : ''} — not overwritten`)
  }

  if (notes.length) out.detail = notes.join('; ')
  return out
}

/**
 * Place a bridge's source delta in the repository's store.
 *
 * Every entry keeps the bridge's facts (op, ids, fingerprints, paths,
 * `deleted_kind`) and gains its store address — or `unmapped` with the reason.
 * `updated` and `moved` gain `fields_changed` against the incoming export; a
 * record the repository also edited gets `conflict: true` and `repo_edit`;
 * every `moved` whose address changed adds a 301 to `redirects`.
 *
 * Nothing is written and nothing is decided: a conflict is reported for a
 * person to resolve, and applying the plan is a separate, governed step.
 */
export function planSourceDelta(input: PlanSourceDeltaInput): SourceDeltaPlan {
  const taxonomies = new Set<string>(input.taxonomies ?? DEFAULT_TAXONOMIES)
  const importers = new Set<string>(input.importers ?? DEFAULT_IMPORTERS)
  const { delta } = input
  const entries = delta.entries.map(entry => planEntry(entry, input, taxonomies, importers))

  const redirects = [...(delta.redirects ?? [])]
  const seen = new Set(redirects.map(redirect => redirect.from))
  for (const entry of entries) {
    if (entry.op !== 'moved' || !entry.path_before || !entry.path_after || entry.path_before === entry.path_after) continue
    if (seen.has(entry.path_before)) continue
    seen.add(entry.path_before)
    redirects.push({ from: entry.path_before, to: entry.path_after, status: 301 })
  }

  const warnings = [...(delta.warnings ?? [])]
  if (!delta.deletions_detectable) warnings.push('deletions could not be determined from this cursor; the absence of a deleted entry does not mean nothing was deleted')
  if (delta.deletions_undetectable_types?.length) warnings.push(`deletions could not be determined for: ${delta.deletions_undetectable_types.join(', ')}`)
  if (!input.incoming) warnings.push('no incoming export: no field-level differences and no address for created records')

  return {
    ...delta,
    entries,
    ...(redirects.length ? { redirects } : {}),
    ...(warnings.length ? { warnings } : {}),
  }
}

// ─── Report ───

const address = (entry: SourceDeltaEntry): string =>
  entry.model && entry.entry_id ? `${entry.model}/${entry.entry_id}${entry.entry_id_after ? ` → ${entry.entry_id_after}` : ''}` : `unmapped (${entry.unmapped})`

/** The plan as text, for a dry run: one line per record, then conflicts, unmapped records, redirects and warnings. */
export function formatSourceDeltaReport(plan: SourceDeltaPlan): string {
  const counts = new Map<string, number>()
  for (const entry of plan.entries) counts.set(entry.op, (counts.get(entry.op) ?? 0) + 1)
  const summary = [...counts].map(([op, n]) => `${n} ${op}`).join(', ') || 'no changes'
  const { cursor } = plan
  const lines = [
    `Source delta: ${plan.entries.length} records (${summary})`,
    `Cursor: ${[cursor.kind, cursor.inventory_hash ?? cursor.modified_after ?? cursor.export_id, `(${cursor.taken_at})`].filter(Boolean).join(' ')}`,
    `Deletions: ${plan.deletions_detectable ? 'detectable' : 'NOT detectable'}`,
    '',
  ]
  for (const entry of plan.entries) {
    const parts = [`${entry.op.padEnd(8)} ${entry.wp_type ?? '?'} ${entry.wp_id}`, address(entry)]
    if (entry.op === 'moved' && entry.path_before) parts.push(`${entry.path_before} → ${entry.path_after}`)
    if (entry.deleted_kind) parts.push(entry.deleted_kind)
    if (entry.fields_changed) parts.push(`fields: ${entry.fields_changed.join(', ') || 'none'}`)
    if (entry.conflict) parts.push('CONFLICT')
    lines.push(`  ${parts.join('  ')}`)
  }
  const conflicts = plan.entries.filter(entry => entry.conflict)
  const unmapped = plan.entries.filter(entry => entry.unmapped)
  lines.push('', `Conflicts (${conflicts.length})${conflicts.length ? ':' : ''}`)
  for (const entry of conflicts) lines.push(`  ${entry.wp_type} ${entry.wp_id} → ${address(entry)}: edited by ${entry.repo_edit?.updated_by}${entry.repo_edit?.updated_at ? ` at ${entry.repo_edit.updated_at}` : ''}`)
  lines.push(`Unmapped (${unmapped.length})${unmapped.length ? ':' : ''}`)
  for (const entry of unmapped) lines.push(`  ${entry.op} ${entry.wp_type} ${entry.wp_id}: ${entry.unmapped}`)
  lines.push(`Redirects (${plan.redirects?.length ?? 0})${plan.redirects?.length ? ':' : ''}`)
  for (const redirect of plan.redirects ?? []) lines.push(`  ${redirect.from} → ${redirect.to} (${redirect.status})`)
  for (const warning of plan.warnings ?? []) lines.push(`Warning: ${warning}`)
  lines.push('', 'Dry run: nothing was written. Applying a plan goes through review.')
  return `${lines.join('\n')}\n`
}
