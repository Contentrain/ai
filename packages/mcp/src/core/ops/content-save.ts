import type { ContentrainConfig, EntryMeta, ModelDefinition, Vocabulary } from '@contentrain/types'
import { generateEntryId, validateEntryId, validateLocale, validateSlug } from '@contentrain/types'
import type { FileChange, RepoReader } from '../contracts/index.js'
import type { ContentEntry } from '../content-manager.js'
import { canonicalStringify, parseMarkdownFrontmatter, serializeMarkdownFrontmatter } from '../serialization/index.js'
import { rewriteEntryMedia, rewriteMarkdownMedia } from '../media/media-rewrite.js'
import type { ContentSaveEntryResult, ContentSavePlan } from './types.js'
import { contentFilePath, documentFilePath, metaFilePath } from './paths.js'
import { mergeEntryMeta } from '../meta-manager.js'

/** Keys named individually in a replacement advisory before it collapses to a count. */
const MAX_REPORTED_KEYS = 5

interface PlanInput {
  model: ModelDefinition
  entries: ContentEntry[]
  config: ContentrainConfig
  vocabulary?: Vocabulary | null
  /**
   * Per-project public media delivery base (`RepoProvider.mediaBaseUrl`). When
   * set (hosted/cloud mode), relative `media/...` references in media fields
   * and markdown bodies are normalized to absolute delivery URLs before the
   * value is committed. Undefined in local mode — paths are kept verbatim.
   */
  mediaBaseUrl?: string
}

/**
 * Build the FileChange[] required to save a batch of content entries. The
 * plan is deterministic, pure, and does not touch disk — it reads existing
 * state through `reader` and returns changes for a single atomic commit.
 *
 * Grouping: multiple entries targeting the same (model, locale) share a
 * single content file and a single meta file. Reads are cached in-memory
 * so repeated reads of the same path during a plan are one IO.
 */
export async function planContentSave(reader: RepoReader, input: PlanInput): Promise<ContentSavePlan> {
  const { model, entries, config, vocabulary, mediaBaseUrl } = input
  const result: ContentSaveEntryResult[] = []
  const advisories: string[] = []

  // Hosted/cloud mode: normalize relative `media/...` references to absolute
  // delivery URLs so the committed value renders anywhere with no SDK. A no-op
  // in local mode (no base) or for field-less models (e.g. dictionaries).
  const normalizeMedia = (data: Record<string, unknown>): Record<string, unknown> =>
    mediaBaseUrl && model.fields ? rewriteEntryMedia(data, model.fields, mediaBaseUrl) : data

  // In-memory accumulators keyed by content-root-relative path.
  const contentByPath = new Map<string, unknown>()
  const metaByPath = new Map<string, unknown>()
  const markdownChanges = new Map<string, string>()

  async function readJsonOrEmpty<T>(path: string): Promise<T> {
    try {
      return JSON.parse(await reader.readFile(path)) as T
    } catch {
      return {} as T
    }
  }

  /** Absent file and absent entry both mean "no prior meta" — hence undefined, not `{}`. */
  async function readJsonOrUndefined<T>(path: string): Promise<T | undefined> {
    try {
      return JSON.parse(await reader.readFile(path)) as T
    } catch {
      return undefined
    }
  }

  /** Prior meta for a whole-file (non-collection) meta path, honouring the accumulator. */
  async function priorMeta(mPath: string): Promise<EntryMeta | undefined> {
    return (metaByPath.get(mPath) as EntryMeta | undefined)
      ?? await readJsonOrUndefined<EntryMeta>(mPath)
  }

  const defaultLocale = config.locales.default

  for (const entry of entries) {
    const locale = entry.locale ?? defaultLocale

    const localeErr = validateLocale(locale, config)
    if (localeErr) throw new Error(localeErr)
    if (entry.id) {
      const err = validateEntryId(entry.id)
      if (err) throw new Error(err)
    }
    if (entry.slug) {
      const err = validateSlug(entry.slug)
      if (err) throw new Error(err)
    }

    switch (model.kind) {
      case 'singleton': {
        const cPath = contentFilePath(model, locale)
        const mPath = metaFilePath(model, locale, defaultLocale)
        contentByPath.set(cPath, normalizeMedia(entry.data))
        metaByPath.set(mPath, mergeEntryMeta(await priorMeta(mPath), entry))
        result.push({ action: 'updated', locale })
        break
      }

      case 'collection': {
        const isNew = !entry.id
        const id = entry.id ?? generateEntryId()
        const cPath = contentFilePath(model, locale)
        const mPath = metaFilePath(model, locale, defaultLocale)

        const existing = (contentByPath.get(cPath) as Record<string, unknown> | undefined)
          ?? await readJsonOrEmpty<Record<string, unknown>>(cPath)

        const action: 'created' | 'updated' = isNew || !(id in existing) ? 'created' : 'updated'
        existing[id] = normalizeMedia(entry.data)

        const sorted: Record<string, unknown> = {}
        for (const key of Object.keys(existing).toSorted()) {
          sorted[key] = existing[key]
        }
        contentByPath.set(cPath, sorted)

        const existingMeta = (metaByPath.get(mPath) as Record<string, EntryMeta> | undefined)
          ?? await readJsonOrEmpty<Record<string, EntryMeta>>(mPath)
        existingMeta[id] = mergeEntryMeta(existingMeta[id], entry)
        metaByPath.set(mPath, existingMeta)

        result.push({ action, id, locale })
        break
      }

      case 'dictionary': {
        const cPath = contentFilePath(model, locale)
        const mPath = metaFilePath(model, locale, defaultLocale)

        const existing = (contentByPath.get(cPath) as Record<string, string> | undefined)
          ?? await readJsonOrEmpty<Record<string, string>>(cPath)

        const newData = entry.data as Record<string, string>
        const entryAdvisories: string[] = []

        // Overwriting a key used to be refused outright, which made the most
        // ordinary dictionary operation — correcting a translation — impossible:
        // the workaround was delete, merge, save, merge. Four operations and two
        // branches to fix one string. The refusal also advised "include all keys
        // in a single save call", which cannot work, because the check compares
        // values per key rather than counting them.
        //
        // Choosing a translation is a content decision, and MCP does not make
        // those. It reports them — the same way the duplicate-value case two
        // blocks below already does — and the branch diff shows the rest.
        const replaced = Object.keys(newData).filter(
          k => k in existing && existing[k] !== newData[k],
        )
        if (replaced.length > 0) {
          const shown = replaced.slice(0, MAX_REPORTED_KEYS)
          const detail = shown.map(k => `"${k}": "${existing[k]}" → "${newData[k]}"`).join(', ')
          const more = replaced.length > shown.length ? `, and ${replaced.length - shown.length} more` : ''
          entryAdvisories.push(
            `Dictionary "${model.id}" (${locale}): replaced ${replaced.length} existing value(s) — ${detail}${more}.`,
          )
        }

        const reverseMap = new Map<string, string>()
        for (const [k, v] of Object.entries(existing)) reverseMap.set(v, k)
        for (const [newKey, newValue] of Object.entries(newData)) {
          if (newKey in existing) continue
          const existingKey = reverseMap.get(newValue)
          if (existingKey && existingKey !== newKey) {
            entryAdvisories.push(
              `Value "${newValue}" already exists as key "${existingKey}". Consider reusing instead of creating "${newKey}".`,
            )
          }
        }

        if (vocabulary && Object.keys(vocabulary.terms).length > 0) {
          outer:
          for (const [newKey, newValue] of Object.entries(newData)) {
            if (newKey in existing) continue
            for (const translations of Object.values(vocabulary.terms)) {
              if (Object.values(translations).includes(newValue)) {
                entryAdvisories.push(
                  `Value "${newValue}" matches a vocabulary term. Use the canonical form for consistency.`,
                )
                continue outer
              }
            }
          }
        }

        advisories.push(...entryAdvisories)

        contentByPath.set(cPath, { ...existing, ...newData })
        metaByPath.set(mPath, mergeEntryMeta(await priorMeta(mPath), entry))

        result.push({
          action: 'updated',
          locale,
          ...(entryAdvisories.length > 0 ? { advisories: entryAdvisories } : {}),
        })
        break
      }

      case 'document': {
        const entryAdvisories: string[] = []
        const slug = entry.slug ?? (entry.data['slug'] as string | undefined)
        if (!slug) throw new Error('Document entries require a slug')
        const slugErr = validateSlug(slug)
        if (slugErr) throw new Error(slugErr)

        const incomingFm = { ...entry.data }
        const bodySent = 'body' in incomingFm
        const incomingBody = (incomingFm['body'] as string | undefined) ?? ''
        delete incomingFm['body']
        if (!incomingFm['slug']) incomingFm['slug'] = slug

        const dPath = documentFilePath(model, locale, slug)
        const mPath = metaFilePath(model, locale, defaultLocale, slug)

        // Accumulator before disk, as the collection branch does: two entries
        // touching one document in a single call must compose, not race.
        let existingRaw: string | null = markdownChanges.get(dPath) ?? null
        if (existingRaw === null) {
          try { existingRaw = await reader.readFile(dPath) }
          catch { /* not yet */ }
        }
        // Same rule the collection branch uses: anything already present —
        // on disk or produced earlier in this plan — makes this an update.
        const action: 'created' | 'updated' = existingRaw ? 'updated' : 'created'

        // Merge with what is on disk, the way collections and singletons above
        // already do. Documents were the only kind that replaced instead of
        // merging, so a save that touched one frontmatter field wrote a file
        // containing only that field — and an entirely empty body. Nothing
        // reported it: the response said `valid: true`, because validation runs
        // over the plan's own output, which was internally consistent and
        // wrong. Under auto-merge that reaches the default branch directly.
        const existing = existingRaw ? parseMarkdownFrontmatter(existingRaw) : null
        const fmData = { ...existing?.frontmatter, ...incomingFm }

        // Absent `body` means "I am not editing the body" — keep what is there.
        // A `body` that is present, even empty, is an instruction, and is
        // honoured; clearing real content that way is announced rather than
        // silent, because it is indistinguishable from a templating mistake.
        const bodyContent = bodySent ? incomingBody : (existing?.body ?? '')
        if (bodySent && !incomingBody.trim() && existing?.body.trim()) {
          const notice = `Document "${slug}" (${locale}): body cleared — an explicit empty "body" replaced ${existing.body.length} characters. Omit "body" to leave it untouched.`
          entryAdvisories.push(notice)
          advisories.push(notice)
        }

        // Frontmatter media fields go through the schema-guided rewrite; the
        // markdown body has its `media/...` image/link targets rewritten too.
        const normalizedBody = mediaBaseUrl ? rewriteMarkdownMedia(bodyContent, mediaBaseUrl) : bodyContent
        markdownChanges.set(dPath, serializeMarkdownFrontmatter(normalizeMedia(fmData), normalizedBody))
        metaByPath.set(mPath, mergeEntryMeta(await priorMeta(mPath), entry))

        result.push({
          action,
          slug,
          locale,
          ...(entryAdvisories.length > 0 ? { advisories: entryAdvisories } : {}),
        })
        break
      }
    }
  }

  const changes: FileChange[] = []
  for (const [path, data] of contentByPath) {
    changes.push({ path, content: canonicalStringify(data) })
  }
  for (const [path, meta] of metaByPath) {
    changes.push({ path, content: canonicalStringify(meta) })
  }
  for (const [path, content] of markdownChanges) {
    changes.push({ path, content })
  }
  changes.sort((a, b) => a.path.localeCompare(b.path))

  return { changes, result, advisories }
}
