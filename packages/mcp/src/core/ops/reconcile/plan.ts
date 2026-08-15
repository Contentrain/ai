import {
  MODEL_FIELD_ORDER,
  canonicalStringify,
  conflictId,
  parseMarkdownFrontmatter,
  stableHash,
} from '@contentrain/types'
import type { ConflictItem, ContentrainConfig, ModelDefinition, Vocabulary } from '@contentrain/types'
import type { FileChange } from '../../contracts/index.js'
import { OverlayReader } from '../../overlay-reader.js'
import { buildContextChange } from '../../context.js'
import { validateProject } from '../../validator/index.js'
import { CachedReader, readJsonOrNull } from './read.js'
import { ResolutionIndex } from './resolutions.js'
import { eqCanonical, makeConflict, mergeLeaf3 } from './three-way.js'
import { mergeCollectionFile, mergeDictionaryFile, mergeKeyedJson, mergeSingletonFile } from './merge-content.js'
import { mergeDocumentFile } from './merge-document.js'
import { mergeMetaFile } from './merge-meta.js'
import { mergeModelFile } from './merge-model.js'
import { mergeVocabulary } from './merge-vocabulary.js'
import {
  SIDES,
  enumerateMetaUnits,
  enumerateSideUnits,
  listModelIds,
  listTextFiles,
  unitOutPath,
} from './walk.js'
import type { Readers, TreeSide } from './walk.js'
import type { ReconcileInput, ReconcilePlan, Side } from './types.js'
import { EMPTY_STATS, addStats } from './types.js'
import type { MergeStats } from './types.js'

const CONTEXT_PATH = '.contentrain/context.json'
const VOCABULARY_PATH = '.contentrain/vocabulary.json'
const SOURCES_PATH = '.contentrain/normalize-sources.json'
const MAX_VALIDATION_ADVISORIES = 15

type RawModel = Record<string, unknown>

/** A merged file awaiting assembly. `value: null` = delete the file. */
interface Output {
  path: string
  format: 'json' | 'model' | 'md' | 'raw'
  value: unknown
}

/**
 * Content-aware three-way merge of `.contentrain/**` (plus `content_path`
 * roots) between a merge-base, the content branch (ours) and the base
 * branch (theirs). Pure planning: reads through the three bound readers,
 * writes nothing, and returns `FileChange[]` to apply ON TOP OF OURS,
 * `ConflictItem[]` for whatever the policy table cannot decide, and a
 * regenerated context.json whenever the plan is not a no-op.
 *
 * Determinism: the same three trees with the same resolutions produce the
 * same changes and the same conflict ids — context.json's embedded
 * timestamp is the sole documented exception.
 */
export async function planReconcile(input: ReconcileInput): Promise<ReconcilePlan> {
  const readers: Readers = {
    base: new CachedReader(input.base),
    ours: new CachedReader(input.ours),
    theirs: new CachedReader(input.theirs),
  }
  const resolutions = new ResolutionIndex(input.resolutions ?? [])
  const conflicts: ConflictItem[] = []
  const advisories: string[] = []
  const outputs: Output[] = []
  const claimed = new Set<string>()
  let stats: MergeStats = EMPTY_STATS

  const config = await readJsonOrNull<ContentrainConfig>(readers.ours, '.contentrain/config.json')
  const defaultLocale = config?.locales?.default ?? 'en'

  // ─── Phase 1: models ───

  const modelIds = await listModelIds(readers)
  const models = await Promise.all(modelIds.map(async (id) => {
    const path = `.contentrain/models/${id}.json`
    const [base, ours, theirs] = await Promise.all(
      SIDES.map(side => readJsonOrNull<RawModel>(readers[side], path)),
    )
    return {
      id,
      path,
      three: { base: base ?? undefined, ours: ours ?? undefined, theirs: theirs ?? undefined },
    }
  }))

  const modelStates = models.map((m) => {
    claimed.add(m.path)
    const result = mergeModelFile(m.three, { outPath: m.path, kind: 'model', model: m.id, resolutions })
    return { id: m.id, path: m.path, three: m.three, result }
  })

  // ─── Phase 2: per-model content + meta ───

  await Promise.all(modelStates.map(async (state) => {
    const { id, path, three, result } = state

    // Deletion family: a clean deletion may still collapse into one
    // model-level question when the surviving side edited the content.
    const oursAbsent = three.ours === undefined
    const theirsAbsent = three.theirs === undefined
    const oneSideDeleted = three.base !== undefined && oursAbsent !== theirsAbsent
    if (result.deleteEdit || (result.merged === undefined && oneSideDeleted)) {
      const deletedBy: Side = result.deleteEdit?.deletedBy ?? (oursAbsent ? 'ours' : 'theirs')
      const survivor: Side = deletedBy === 'ours' ? 'theirs' : 'ours'
      await collapseModelDeletion(state.id, path, three, deletedBy, survivor, !!result.deleteEdit)
      return
    }

    conflicts.push(...result.conflicts)
    stats = addStats(stats, result.stats)

    if (result.merged === undefined) {
      // Deleted on both sides (or never present) — nothing left to place.
      await claimModelFiles(id, three)
      return
    }

    if (result.structurallyBlocked) {
      // The keys that locate this model's files are themselves in conflict.
      // Content cannot be merged safely; the model-level conflicts (already
      // pushed) are the only report. Claim the files so the unclaimed scan
      // does not double-report them.
      advisories.push(`Model "${id}": structural schema keys are in conflict — its content was left untouched until they are resolved.`)
      await claimModelFiles(id, three)
      return
    }

    const winning = result.merged as unknown as ModelDefinition
    if (typeof winning.kind !== 'string' || typeof winning.id !== 'string') {
      advisories.push(`Model "${id}": merged definition is structurally incomplete — content left untouched.`)
      await claimModelFiles(id, three)
      return
    }

    outputs.push({ path, format: 'model', value: result.merged })

    // Content units: each side enumerated with ITS OWN definition.
    const sideDefs: Partial<Record<TreeSide, ModelDefinition>> = {}
    for (const side of SIDES) {
      const def = three[side] as unknown as ModelDefinition | undefined
      if (def && typeof def.kind === 'string') sideDefs[side] = def
    }
    const perSide = await Promise.all(SIDES.map(async (side) => {
      const def = sideDefs[side]
      return { side, units: def ? await enumerateSideUnits(readers[side], def, defaultLocale) : [] }
    }))

    const unitMap = new Map<string, { locale?: string, slug?: string, paths: Partial<Record<TreeSide, string>> }>()
    for (const { side, units } of perSide) {
      for (const unit of units) {
        claimed.add(unit.path)
        const key = unitKey(unit)
        const entry = unitMap.get(key) ?? { locale: unit.locale, slug: unit.slug, paths: {} }
        entry.paths[side] = unit.path
        unitMap.set(key, entry)
      }
    }

    await Promise.all([...unitMap.values()].map(async (unit) => {
      const [baseRaw, oursRaw, theirsRaw] = await Promise.all(SIDES.map(side =>
        unit.paths[side] ? readers[side].readOrNull(unit.paths[side]!) : Promise.resolve(null)))
      const outPath = unitOutPath(winning, defaultLocale, unit.locale, unit.slug)
      claimed.add(outPath)
      const ctx = {
        outPath,
        kind: winning.kind as ConflictItem['kind'],
        model: id,
        locale: unit.locale,
        resolutions,
      }

      if (winning.kind === 'document') {
        const merge = mergeDocumentFile(
          { base: baseRaw ?? undefined, ours: oursRaw ?? undefined, theirs: theirsRaw ?? undefined },
          { ...ctx, slug: unit.slug ?? '' },
        )
        conflicts.push(...merge.conflicts)
        advisories.push(...merge.advisories)
        stats = addStats(stats, merge.stats)
        outputs.push({ path: outPath, format: 'md', value: merge.merged ?? null })
      } else {
        const parsed = {
          base: parseJson(baseRaw ?? null),
          ours: parseJson(oursRaw ?? null),
          theirs: parseJson(theirsRaw ?? null),
        }
        const merge = winning.kind === 'dictionary'
          ? mergeDictionaryFile(parsed as never, ctx)
          : winning.kind === 'singleton'
            ? mergeSingletonFile(parsed as never, ctx)
            : mergeCollectionFile(parsed as never, ctx)
        conflicts.push(...merge.conflicts)
        stats = addStats(stats, merge.stats)
        outputs.push({ path: outPath, format: 'json', value: merge.merged ?? null })
      }

      // The winning definition moved the file (content_path / strategy
      // change): the merged file lands at outPath and ours' old copy goes.
      if (unit.paths.ours && unit.paths.ours !== outPath) {
        outputs.push({ path: unit.paths.ours, format: 'raw', value: null })
      }
    }))

    // Meta: fixed layout, dispatch on the winning kind.
    const metaPerSide = await Promise.all(SIDES.map(side => enumerateMetaUnits(readers[side], id)))
    const metaMap = new Map<string, { locale: string, slug?: string, path: string }>()
    for (const units of metaPerSide) {
      for (const unit of units) {
        claimed.add(unit.path)
        metaMap.set(unit.path, unit)
      }
    }
    await Promise.all([...metaMap.values()].map(async (unit) => {
      const [base, ours, theirs] = await Promise.all(SIDES.map(side => readJsonOrNull<RawModel>(readers[side], unit.path)))
      const merge = mergeMetaFile(
        { base: base ?? undefined, ours: ours ?? undefined, theirs: theirs ?? undefined },
        { outPath: unit.path, kind: 'meta', model: id, locale: unit.locale, resolutions },
        winning.kind === 'collection',
      )
      conflicts.push(...merge.conflicts)
      advisories.push(...merge.advisories)
      stats = addStats(stats, merge.stats)
      outputs.push({ path: unit.path, format: 'json', value: merge.merged ?? null })
    }))
  }))

  // ─── Phase 3: fixed paths ───

  claimed.add(VOCABULARY_PATH)
  claimed.add(SOURCES_PATH)
  {
    const [base, ours, theirs] = await Promise.all(SIDES.map(side => readJsonOrNull<Vocabulary>(readers[side], VOCABULARY_PATH)))
    if (base !== null || ours !== null || theirs !== null) {
      const merge = mergeVocabulary(
        { base: base ?? undefined, ours: ours ?? undefined, theirs: theirs ?? undefined },
        { outPath: VOCABULARY_PATH, kind: 'vocabulary', resolutions },
      )
      conflicts.push(...merge.conflicts)
      stats = addStats(stats, merge.stats)
      outputs.push({ path: VOCABULARY_PATH, format: 'json', value: merge.merged ?? null })
    }
  }
  {
    const [base, ours, theirs] = await Promise.all(SIDES.map(side => readJsonOrNull<RawModel>(readers[side], SOURCES_PATH)))
    if (base !== null || ours !== null || theirs !== null) {
      const merge = mergeKeyedJson(
        { base: base ?? undefined, ours: ours ?? undefined, theirs: theirs ?? undefined },
        { outPath: SOURCES_PATH, kind: 'file', resolutions },
      )
      conflicts.push(...merge.conflicts)
      stats = addStats(stats, merge.stats)
      outputs.push({ path: SOURCES_PATH, format: 'json', value: merge.merged ?? null })
    }
  }

  // ─── Phase 4: unclaimed scan ───
  // Everything under the recognized roots that no phase claimed. A change
  // on one side is mechanical (`theirs`-only changes become plan output so
  // tree-building executors reproduce what git's merge machinery would);
  // a change on both sides is a whole-file question — the planner NEVER
  // invents content for a file it does not understand.

  const roots = new Set<string>(['.contentrain'])
  for (const state of modelStates) {
    for (const side of SIDES) {
      const contentPath = (state.three[side] as { content_path?: unknown } | undefined)?.content_path
      if (typeof contentPath === 'string' && contentPath.length > 0) roots.add(contentPath)
    }
  }
  const scanned = await Promise.all([...roots].map(async root =>
    Promise.all(SIDES.map(side => listTextFiles(readers[side], root)))))
  const candidates = new Set<string>()
  for (const perRoot of scanned) {
    for (const files of perRoot) {
      for (const file of files) {
        if (!claimed.has(file)) candidates.add(file)
      }
    }
  }
  await Promise.all([...candidates].toSorted().map(async (path) => {
    const [baseRaw, oursRaw, theirsRaw] = await Promise.all(SIDES.map(side => readers[side].readOrNull(path)))
    const leaf = mergeLeaf3(baseRaw ?? undefined, oursRaw ?? undefined, theirsRaw ?? undefined)
    if (leaf.ok) {
      if (leaf.from === 'theirs') outputs.push({ path, format: 'raw', value: (leaf.value as string | undefined) ?? null })
      return
    }
    // Identity via digests: content-sensitive (N1) without shipping whole
    // files in the conflict item.
    const digestCandidate = {
      path,
      base: baseRaw == null ? undefined : stableHash(baseRaw),
      ours: oursRaw == null ? undefined : stableHash(oursRaw),
      theirs: theirsRaw == null ? undefined : stableHash(theirsRaw),
    }
    const resolution = resolutions.consume(digestCandidate)
    if (resolution && 'choose' in resolution) {
      const chosen = resolution.choose === 'ours' ? oursRaw : theirsRaw
      outputs.push({ path, format: 'raw', value: chosen })
      return
    }
    if (resolution) {
      advisories.push(`Resolution for "${path}" supplied a value — file-level conflicts accept only { choose } and the resolution was ignored.`)
    }
    conflicts.push({
      id: conflictId(digestCandidate),
      path,
      kind: 'file',
      code: 'file_conflict',
      message: `${path} was changed on both sides and is not content this planner understands — choose a side.`,
    })
  }))

  // ─── Assembly ───

  const changes: FileChange[] = []
  await Promise.all(outputs.map(async (out) => {
    const oursRaw = await readers.ours.readOrNull(out.path)
    if (out.value === null) {
      if (oursRaw !== null) changes.push({ path: out.path, content: null })
      return
    }
    if (out.format === 'md' || out.format === 'raw') {
      const next = out.value as string
      if (oursRaw === null) {
        changes.push({ path: out.path, content: next })
        return
      }
      if (out.format === 'raw') {
        if (oursRaw !== next) changes.push({ path: out.path, content: next })
        return
      }
      const a = parseMarkdownFrontmatter(oursRaw)
      const b = parseMarkdownFrontmatter(next)
      if (!eqCanonical(a.frontmatter, b.frontmatter) || a.body !== b.body) {
        changes.push({ path: out.path, content: next })
      }
      return
    }
    // json / model: compare parsed values so a byte-level formatting
    // difference never becomes a change — reconcile is not a formatter.
    const oursParsed = parseJson(oursRaw)
    if (eqCanonical(out.value, oursParsed)) return
    const fieldOrder = out.format === 'model' ? MODEL_FIELD_ORDER : undefined
    changes.push({ path: out.path, content: canonicalStringify(out.value, fieldOrder) })
  }))

  const filesMerged = changes.length
  const regenerated: string[] = []
  if (changes.length > 0) {
    try {
      const contextChange = await buildContextChange(
        new OverlayReader(readers.ours, changes),
        { tool: 'contentrain_reconcile', model: '*' },
        input.source,
      )
      changes.push(contextChange)
      regenerated.push(CONTEXT_PATH)
    } catch {
      advisories.push('context.json could not be regenerated — run contentrain_validate after applying.')
    }
  }

  if (changes.length > 0) {
    try {
      const validation = await validateProject(new OverlayReader(readers.ours, changes), {})
      const issues = validation.issues.filter(i => i.severity !== 'notice')
      const shown = issues.slice(0, MAX_VALIDATION_ADVISORIES)
      for (const issue of shown) {
        advisories.push(`validation (${issue.severity}): ${issue.model ?? ''}${issue.field ? `.${issue.field}` : ''} — ${issue.message}`)
      }
      if (issues.length > shown.length) {
        advisories.push(`validation: ${issues.length - shown.length} more issue(s) — run contentrain_validate for the full report.`)
      }
    } catch {
      advisories.push('Post-merge validation could not run — validate after applying.')
    }
  }

  for (const stale of resolutions.unconsumed()) {
    advisories.push(`Resolution ${stale.id} no longer matches any conflict — values changed since the dry-run; the conflict is re-reported with a new id.`)
  }

  if (changes.length === 0 && conflicts.length === 0) {
    advisories.push('Trees are already reconciled — nothing to merge.')
  }

  changes.sort((a, b) => a.path.localeCompare(b.path, 'en'))
  conflicts.sort((a, b) =>
    a.path.localeCompare(b.path, 'en')
    || (a.key ?? '').localeCompare(b.key ?? '', 'en')
    || (a.field ?? '').localeCompare(b.field ?? '', 'en')
    || (a.locale ?? '').localeCompare(b.locale ?? '', 'en'))

  return {
    changes,
    conflicts,
    advisories,
    result: {
      files_merged: filesMerged,
      entries_taken_ours: stats.takenOurs,
      entries_taken_theirs: stats.takenTheirs,
      entries_field_merged: stats.fieldMerged,
      regenerated,
    },
  }

  // ─── Model deletion helpers (closures over readers/outputs/conflicts) ───

  /** Claim every side's files of a model so the scan never double-reports. */
  async function claimModelFiles(id: string, three: { base?: RawModel, ours?: RawModel, theirs?: RawModel }): Promise<void> {
    await Promise.all(SIDES.map(async (side) => {
      const def = three[side] as unknown as ModelDefinition | undefined
      if (def && typeof def.kind === 'string') {
        const units = await enumerateSideUnits(readers[side], def, defaultLocale)
        for (const unit of units) claimed.add(unit.path)
      }
      const meta = await enumerateMetaUnits(readers[side], id)
      for (const unit of meta) claimed.add(unit.path)
    }))
  }

  /**
   * One side deleted the model. If the surviving side left everything
   * untouched, the deletion cascades mechanically over content and meta.
   * The moment the survivor edited anything — the definition or one entry —
   * the whole model collapses into a SINGLE delete-vs-edit question
   * instead of one conflict per file.
   */
  async function collapseModelDeletion(
    id: string,
    modelPath: string,
    three: { base?: RawModel, ours?: RawModel, theirs?: RawModel },
    deletedBy: Side,
    survivor: Side,
    modelFileEdited: boolean,
  ): Promise<void> {
    await claimModelFiles(id, three)

    const survivorDef = three[survivor] as unknown as ModelDefinition | undefined
    const survivorFiles = await modelFileDigestList(survivor, id, survivorDef)
    const baseFiles = await modelFileDigestList('base', id, three.base as unknown as ModelDefinition | undefined)
    const contentEdited = JSON.stringify(survivorFiles) !== JSON.stringify(baseFiles)

    if (!modelFileEdited && !contentEdited) {
      // Mechanical cascade: deletion wins; drop everything ours still has.
      await deleteModelEverywhere(id, three)
      return
    }

    const digestFor = async (side: TreeSide): Promise<unknown> => {
      const def = three[side] as unknown as ModelDefinition | undefined
      if (!def && side !== 'base') return undefined
      const files = await modelFileDigestList(side, id, def)
      return { model: three[side] ? stableHash(JSON.stringify(three[side])) : null, files: stableHash(JSON.stringify(files)) }
    }
    const [baseDigest, oursDigest, theirsDigest] = await Promise.all([digestFor('base'), digestFor('ours'), digestFor('theirs')])
    const candidate = { path: modelPath, base: baseDigest, ours: oursDigest, theirs: theirsDigest }
    const resolution = resolutions.consume(candidate)
    if (resolution && 'choose' in resolution) {
      if (resolution.choose === deletedBy) {
        await deleteModelEverywhere(id, three)
      } else {
        await keepModelWholesale(id, modelPath, three, survivor)
      }
      return
    }
    if (resolution) {
      advisories.push(`Resolution for model "${id}" supplied a value — model delete-vs-edit accepts only { choose } and the resolution was ignored.`)
    }
    conflicts.push(makeConflict({
      ...candidate,
      kind: 'model',
      model: id,
      code: 'delete_edit_conflict',
      message: `Model "${id}" was deleted on one side (${deletedBy}) while the other side edited its ${modelFileEdited ? 'definition' : 'content'} — keep the model or drop it.`,
    }))
  }

  /** Digest list of one side's model-owned files (content + meta), sorted. */
  async function modelFileDigestList(side: TreeSide, id: string, def: ModelDefinition | undefined): Promise<Array<[string, string]>> {
    const units = def && typeof def.kind === 'string'
      ? await enumerateSideUnits(readers[side], def, defaultLocale)
      : []
    const meta = await enumerateMetaUnits(readers[side], id)
    const paths = [...units.map(u => u.path), ...meta.map(u => u.path)].toSorted()
    const raws = await Promise.all(paths.map(path => readers[side].readOrNull(path)))
    return paths.map((path, i) => [path, stableHash(raws[i] ?? '')] as [string, string])
  }

  /** Emit deletions for every model-owned file ours still carries. */
  async function deleteModelEverywhere(id: string, three: { base?: RawModel, ours?: RawModel, theirs?: RawModel }): Promise<void> {
    outputs.push({ path: `.contentrain/models/${id}.json`, format: 'raw', value: null })
    const oursDef = three.ours as unknown as ModelDefinition | undefined
    const units = oursDef && typeof oursDef.kind === 'string'
      ? await enumerateSideUnits(readers.ours, oursDef, defaultLocale)
      : []
    const meta = await enumerateMetaUnits(readers.ours, id)
    for (const unit of [...units.map(u => u.path), ...meta.map(u => u.path)]) {
      outputs.push({ path: unit, format: 'raw', value: null })
    }
  }

  /** Take the surviving side wholesale: definition, content, meta. */
  async function keepModelWholesale(
    id: string,
    modelPath: string,
    three: { base?: RawModel, ours?: RawModel, theirs?: RawModel },
    survivor: Side,
  ): Promise<void> {
    outputs.push({ path: modelPath, format: 'model', value: three[survivor] })
    const survivorDef = three[survivor] as unknown as ModelDefinition | undefined
    const units = survivorDef && typeof survivorDef.kind === 'string'
      ? await enumerateSideUnits(readers[survivor], survivorDef, defaultLocale)
      : []
    const meta = await enumerateMetaUnits(readers[survivor], id)
    const survivorPaths = [...units.map(u => u.path), ...meta.map(u => u.path)]
    const raws = await Promise.all(survivorPaths.map(path => readers[survivor].readOrNull(path)))
    survivorPaths.forEach((path, i) => {
      outputs.push({ path, format: 'raw', value: raws[i] })
    })
    // Ours-side files the survivor does not have go away.
    const oursDef = three.ours as unknown as ModelDefinition | undefined
    const oursUnits = oursDef && typeof oursDef.kind === 'string'
      ? await enumerateSideUnits(readers.ours, oursDef, defaultLocale)
      : []
    const oursMeta = await enumerateMetaUnits(readers.ours, id)
    const survivorSet = new Set(survivorPaths)
    for (const path of [...oursUnits.map(u => u.path), ...oursMeta.map(u => u.path)]) {
      if (!survivorSet.has(path)) outputs.push({ path, format: 'raw', value: null })
    }
  }
}

function unitKey(u: { locale?: string, slug?: string }): string {
  return `${u.locale ?? ''}::${u.slug ?? ''}`
}

function parseJson(raw: string | null): Record<string, unknown> | undefined {
  if (raw === null) return undefined
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return undefined
  }
}
