import { parseMarkdownFrontmatter, serializeMarkdownFrontmatter } from '@contentrain/types'
import type { ConflictItem } from '@contentrain/types'
import type { FileCtx, MergeStats, ThreeWay } from './types.js'
import { EMPTY_STATS } from './types.js'
import { eqCanonical, makeConflict, mergeLeaf3, statsFor } from './three-way.js'
import { resolvedValue } from './resolutions.js'

/**
 * Document (.md) three-way merge: frontmatter key-by-key, body as one leaf.
 *
 * The body is deliberately never text-merged. Interleaving two prose edits
 * line-by-line produces syntactically plausible, editorially wrong hybrids —
 * choosing between two versions of prose is a content decision, and MCP
 * does not make those.
 *
 * The frontmatter parser round-trips only scalars and scalar arrays
 * (nested maps serialize but do not parse back). A side whose frontmatter
 * does not survive parse→serialize is not safe to rewrite, so the merge
 * falls back to whole-file resolution for that document instead of
 * silently destroying nested data.
 */
export function mergeDocumentFile(
  three: ThreeWay<string>,
  ctx: FileCtx & { slug: string },
): { merged: string | undefined, conflicts: ConflictItem[], stats: MergeStats, advisories: string[] } {
  const fileLeaf = mergeLeaf3(three.base, three.ours, three.theirs)
  if (fileLeaf.ok) {
    return { merged: fileLeaf.value as string | undefined, conflicts: [], stats: statsFor(fileLeaf.from), advisories: [] }
  }

  if (fileLeaf.reason === 'delete_edit') {
    const candidate = {
      path: ctx.outPath, key: ctx.slug, locale: ctx.locale,
      base: three.base, ours: three.ours, theirs: three.theirs,
    }
    const resolution = ctx.resolutions.consume(candidate)
    if (resolution) {
      return { merged: resolvedValue(resolution, candidate) as string | undefined, conflicts: [], stats: EMPTY_STATS, advisories: [] }
    }
    return {
      merged: three.ours,
      conflicts: [makeConflict({
        ...candidate,
        kind: 'document',
        model: ctx.model,
        code: 'delete_edit_conflict',
        message: `Document "${ctx.slug}" was deleted on one side and edited on the other (${ctx.outPath}).`,
      })],
      stats: EMPTY_STATS,
      advisories: [],
    }
  }

  // Both sides changed. Structured merge is only safe when every present
  // side survives the parse→serialize round-trip.
  const parsed = {
    base: three.base === undefined ? undefined : parseMarkdownFrontmatter(three.base),
    ours: three.ours === undefined ? undefined : parseMarkdownFrontmatter(three.ours),
    theirs: three.theirs === undefined ? undefined : parseMarkdownFrontmatter(three.theirs),
  }
  const lossy = (['ours', 'theirs'] as const).some((side) => {
    const doc = parsed[side]
    if (!doc) return false
    const reserialized = parseMarkdownFrontmatter(serializeMarkdownFrontmatter(doc.frontmatter, doc.body))
    return !eqCanonical(reserialized.frontmatter, doc.frontmatter) || reserialized.body !== doc.body
  })
  if (lossy) {
    const candidate = {
      path: ctx.outPath, key: ctx.slug, locale: ctx.locale,
      base: three.base, ours: three.ours, theirs: three.theirs,
    }
    const resolution = ctx.resolutions.consume(candidate)
    if (resolution) {
      return { merged: resolvedValue(resolution, candidate) as string | undefined, conflicts: [], stats: EMPTY_STATS, advisories: [] }
    }
    return {
      merged: three.ours,
      conflicts: [makeConflict({
        ...candidate,
        kind: 'document',
        model: ctx.model,
        code: 'file_conflict',
        message: `Document "${ctx.slug}" (${ctx.outPath}) changed on both sides and carries frontmatter the structured merge cannot round-trip — choose a side.`,
      })],
      stats: EMPTY_STATS,
      advisories: [`Document "${ctx.slug}": fell back to whole-file resolution (nested frontmatter does not round-trip).`],
    }
  }

  // Frontmatter: key-level leaves. `body` is reserved and never appears in
  // frontmatter (the writer strips it), so no collision with the body leaf.
  const conflicts: ConflictItem[] = []
  const fmKeys = [...new Set([
    ...Object.keys(parsed.base?.frontmatter ?? {}),
    ...Object.keys(parsed.ours?.frontmatter ?? {}),
    ...Object.keys(parsed.theirs?.frontmatter ?? {}),
  ])].toSorted()
  const mergedFm: Record<string, unknown> = {}
  for (const key of fmKeys) {
    const candidate = {
      path: ctx.outPath, key: ctx.slug, field: key, locale: ctx.locale,
      base: parsed.base?.frontmatter[key],
      ours: parsed.ours?.frontmatter[key],
      theirs: parsed.theirs?.frontmatter[key],
    }
    const leaf = mergeLeaf3(candidate.base, candidate.ours, candidate.theirs)
    if (leaf.ok) {
      if (leaf.value !== undefined) mergedFm[key] = leaf.value
      continue
    }
    const resolution = ctx.resolutions.consume(candidate)
    if (resolution) {
      const value = resolvedValue(resolution, candidate)
      if (value !== undefined) mergedFm[key] = value
      continue
    }
    if (candidate.ours !== undefined) mergedFm[key] = candidate.ours
    conflicts.push(makeConflict({
      ...candidate,
      kind: 'document',
      model: ctx.model,
      code: leaf.reason === 'delete_edit' ? 'delete_edit_conflict' : 'frontmatter_value_conflict',
      message: `Frontmatter key "${key}" of document "${ctx.slug}" differs on both sides (${ctx.outPath}).`,
    }))
  }

  // Body: one leaf.
  let mergedBody: string
  const bodyCandidate = {
    path: ctx.outPath, key: ctx.slug, field: 'body', locale: ctx.locale,
    base: parsed.base?.body, ours: parsed.ours?.body, theirs: parsed.theirs?.body,
  }
  const bodyLeaf = mergeLeaf3(bodyCandidate.base, bodyCandidate.ours, bodyCandidate.theirs)
  if (bodyLeaf.ok) {
    mergedBody = (bodyLeaf.value as string | undefined) ?? ''
  } else {
    const resolution = ctx.resolutions.consume(bodyCandidate)
    if (resolution) {
      mergedBody = (resolvedValue(resolution, bodyCandidate) as string | undefined) ?? ''
    } else {
      mergedBody = bodyCandidate.ours ?? ''
      conflicts.push(makeConflict({
        ...bodyCandidate,
        kind: 'document',
        model: ctx.model,
        code: 'document_body_conflict',
        message: `Body of document "${ctx.slug}" was edited on both sides (${ctx.outPath}) — bodies are never text-merged.`,
      }))
    }
  }

  return {
    merged: serializeMarkdownFrontmatter(mergedFm, mergedBody),
    conflicts,
    stats: conflicts.length === 0 ? { takenOurs: 0, takenTheirs: 0, fieldMerged: 1 } : EMPTY_STATS,
    advisories: [],
  }
}
