import type { ModelDefinition, FieldDef } from '@contentrain/types'
import { join } from 'node:path'
import { readText, writeText, pathExists } from '../util/fs.js'
import { readModel, writeModel, listModels } from './model-manager.js'
import { writeContent, type ContentEntry } from './content-manager.js'
import { readConfig } from './config.js'
import { writeContext } from './context.js'
import { createTransaction, buildBranchName } from '../git/transaction.js'

// ─── Types ───

export interface ExtractionEntry {
  model: string
  kind: 'singleton' | 'collection' | 'dictionary' | 'document'
  domain: string
  i18n?: boolean
  fields?: Record<string, FieldDef>
  entries: Array<{
    locale?: string
    slug?: string
    data: Record<string, unknown>
    source?: { file: string; line: number; value: string }
  }>
}

export interface ExtractionInput {
  extractions: ExtractionEntry[]
  dry_run?: boolean
}

export interface ExtractionPreview {
  models_to_create: string[]
  models_to_update: string[]
  total_entries: number
  content_files: string[]
}

export interface ExtractionResult {
  dry_run: boolean
  preview?: ExtractionPreview
  results?: {
    models_created: string[]
    models_updated: string[]
    entries_written: number
    source_map: Array<{ model: string; locale: string; value: string; file: string; line: number }>
  }
  git?: { branch: string; action: string; commit: string }
  context_updated?: boolean
  next_steps: string[]
}

export interface PatchEntry {
  file: string
  line: number
  old_value: string
  new_expression: string
  import_statement?: string
}

export interface ReuseInput {
  scope: { model?: string; domain?: string }
  patches: PatchEntry[]
  dry_run?: boolean
}

export interface ReuseResult {
  dry_run: boolean
  preview?: {
    files_to_modify: string[]
    patches_count: number
    imports_to_add: number
  }
  results?: {
    files_modified: string[]
    patches_applied: number
    patches_skipped: Array<{ file: string; line: number; reason: string }>
    imports_added: number
  }
  git?: { branch: string; action: string; commit: string }
  next_steps: string[]
}

// ─── Constants ───

const MAX_PATCHES = 100

// ─── Extract Mode ───

export async function applyExtract(
  projectRoot: string,
  input: ExtractionInput,
): Promise<ExtractionResult> {
  const config = await readConfig(projectRoot)
  if (!config) throw new Error('Project not initialized. Run contentrain_init first.')

  const { extractions, dry_run } = input

  // Analyze what will happen
  const existingModels = await listModels(projectRoot)
  const existingIds = new Set(existingModels.map(m => m.id))

  const modelsToCreate: string[] = []
  const modelsToUpdate: string[] = []
  const contentFiles: string[] = []
  let totalEntries = 0

  for (const ext of extractions) {
    if (existingIds.has(ext.model)) {
      modelsToUpdate.push(ext.model)
    } else {
      modelsToCreate.push(ext.model)
    }
    totalEntries += ext.entries.length

    // Estimate content file paths
    for (const entry of ext.entries) {
      const locale = entry.locale ?? config.locales.default
      if (ext.kind === 'document' && entry.slug) {
        contentFiles.push(`content/${ext.domain}/${ext.model}/${entry.slug}/${locale}.md`)
      } else {
        contentFiles.push(`content/${ext.domain}/${ext.model}/${locale}.json`)
      }
    }
  }

  const preview: ExtractionPreview = {
    models_to_create: modelsToCreate,
    models_to_update: modelsToUpdate,
    total_entries: totalEntries,
    content_files: [...new Set(contentFiles)],
  }

  // Dry run — return preview only
  if (dry_run !== false) {
    return {
      dry_run: true,
      preview,
      next_steps: [
        'Review the preview above',
        'Call contentrain_apply with mode:extract and dry_run:false to execute',
      ],
    }
  }

  // Execute — git transaction (always review mode for normalize)
  const branchName = buildBranchName('normalize', 'extract')
  const tx = await createTransaction(projectRoot, branchName, { workflowOverride: 'review' })
  const sourceMap: Array<{ model: string; locale: string; value: string; file: string; line: number }> = []
  const modelsCreated: string[] = []
  const modelsUpdated: string[] = []
  let entriesWritten = 0

  try {
    await tx.write(async (wt) => {
      for (const ext of extractions) {
        // Create or merge model
        const existing = await readModel(wt, ext.model)
        if (existing) {
          // Merge fields: add new, keep existing
          if (ext.fields) {
            const merged = { ...existing.fields, ...ext.fields }
            // Only overwrite if new fields were actually added
            const newFieldNames = Object.keys(ext.fields).filter(k => !(k in (existing.fields ?? {})))
            if (newFieldNames.length > 0) {
              existing.fields = merged
              await writeModel(wt, existing)
              modelsUpdated.push(ext.model)
            }
          }
        } else {
          // Create new model
          const newModel: ModelDefinition = {
            id: ext.model,
            name: ext.model.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
            kind: ext.kind,
            domain: ext.domain,
            i18n: ext.i18n ?? true,
            fields: ext.fields,
          }
          await writeModel(wt, newModel)
          modelsCreated.push(ext.model)
        }

        // Write content entries
        const model = (await readModel(wt, ext.model))!
        const entries: ContentEntry[] = ext.entries.map(e => ({
          locale: e.locale,
          slug: e.slug,
          data: e.data,
        }))

        const wtConfig = await readConfig(wt) ?? config
        await writeContent(wt, model, entries, wtConfig)
        entriesWritten += entries.length

        // Track source map
        for (const entry of ext.entries) {
          if (entry.source) {
            sourceMap.push({
              model: ext.model,
              locale: entry.locale ?? config.locales.default,
              value: entry.source.value,
              file: entry.source.file,
              line: entry.source.line,
            })
          }
        }
      }

      // Update context
      await writeContext(wt, {
        tool: 'contentrain_apply',
        model: extractions.map(e => e.model).join(','),
        locale: config.locales.default,
        entries: extractions.flatMap(e => e.entries.map(en => en.slug ?? 'entry')),
      })
    })

    const commitMsg = `[contentrain] normalize: extract ${entriesWritten} entries to ${extractions.length} models`
    await tx.commit(commitMsg)

    const gitResult = { branch: branchName, action: 'pending-review', commit: '' }
    try {
      const completed = await tx.complete()
      gitResult.action = completed.action
      gitResult.commit = completed.commit
    } catch {
      gitResult.action = 'pending-review'
    } finally {
      await tx.cleanup()
    }

    return {
      dry_run: false,
      results: {
        models_created: modelsCreated,
        models_updated: modelsUpdated,
        entries_written: entriesWritten,
        source_map: sourceMap,
      },
      git: gitResult,
      context_updated: true,
      next_steps: [
        'Run contentrain_validate to check the extracted content',
        'Run contentrain_submit to push the branch for review',
        'After review, proceed with mode:reuse to patch source files',
      ],
    }
  } catch (error) {
    await tx.cleanup()
    throw error
  }
}

// ─── Reuse Mode ───

export async function applyReuse(
  projectRoot: string,
  input: ReuseInput,
): Promise<ReuseResult> {
  const config = await readConfig(projectRoot)
  if (!config) throw new Error('Project not initialized. Run contentrain_init first.')

  const { scope, patches, dry_run } = input

  // Validate scope
  if (!scope.model && !scope.domain) {
    throw new Error('Scope required: provide model or domain. Whole-project patching is not allowed.')
  }

  // Validate patch count
  if (patches.length > MAX_PATCHES) {
    throw new Error(`Too many patches (${patches.length}). Maximum ${MAX_PATCHES} per operation. Split into multiple calls.`)
  }

  // Check content exists for scope (soft warning)
  if (scope.model) {
    const model = await readModel(projectRoot, scope.model)
    if (!model) {
      throw new Error(`Model "${scope.model}" not found. Run extract phase first.`)
    }
  }

  // Group patches by file
  const patchesByFile = new Map<string, PatchEntry[]>()
  for (const patch of patches) {
    if (!patchesByFile.has(patch.file)) {
      patchesByFile.set(patch.file, [])
    }
    patchesByFile.get(patch.file)!.push(patch)
  }

  const filesToModify = [...patchesByFile.keys()]
  const importsToAdd = patches.filter(p => p.import_statement).length

  // Dry run — return preview only
  if (dry_run !== false) {
    return {
      dry_run: true,
      preview: {
        files_to_modify: filesToModify,
        patches_count: patches.length,
        imports_to_add: importsToAdd,
      },
      next_steps: [
        'Review the files and patches above',
        'Call contentrain_apply with mode:reuse and dry_run:false to execute',
      ],
    }
  }

  // Execute — git transaction
  const scopeTarget = scope.model ?? scope.domain!
  const branchName = buildBranchName('normalize/reuse', scopeTarget)
  const tx = await createTransaction(projectRoot, branchName, { workflowOverride: 'review' })

  const filesModified: string[] = []
  let patchesApplied = 0
  let importsAdded = 0
  const patchesSkipped: Array<{ file: string; line: number; reason: string }> = []

  try {
    await tx.write(async (wt) => {
      for (const [relFile, filePatches] of patchesByFile) {
        const absPath = join(wt, relFile)

        if (!(await pathExists(absPath))) {
          for (const p of filePatches) {
            patchesSkipped.push({ file: relFile, line: p.line, reason: 'file not found' })
          }
          continue
        }

        let content = await readText(absPath)
        if (content === null) {
          for (const p of filePatches) {
            patchesSkipped.push({ file: relFile, line: p.line, reason: 'file unreadable' })
          }
          continue
        }

        // Sort patches by line DESC (bottom-up to avoid line shifts)
        const sorted = [...filePatches].toSorted((a, b) => b.line - a.line)

        const lines = content.split('\n')
        let fileModified = false

        for (const patch of sorted) {
          const applied = applyPatchToLines(lines, patch)
          if (applied) {
            patchesApplied++
            fileModified = true
          } else {
            patchesSkipped.push({ file: relFile, line: patch.line, reason: 'old_value not found at or near specified line' })
          }
        }

        // Add imports (deduplicate)
        const importStatements = new Set(
          filePatches
            .filter(p => p.import_statement)
            .map(p => p.import_statement!),
        )

        if (importStatements.size > 0) {
          const added = addImportsToLines(lines, importStatements)
          importsAdded += added
          if (added > 0) fileModified = true
        }

        if (fileModified) {
          await writeText(absPath, lines.join('\n'))
          filesModified.push(relFile)
        }
      }

      // Update context
      await writeContext(wt, {
        tool: 'contentrain_apply',
        model: scopeTarget,
        locale: config.locales.default,
      })
    })

    if (filesModified.length === 0) {
      await tx.cleanup()
      return {
        dry_run: false,
        results: {
          files_modified: [],
          patches_applied: 0,
          patches_skipped: patchesSkipped,
          imports_added: 0,
        },
        next_steps: ['No files were modified. Check patch definitions and try again.'],
      }
    }

    const commitMsg = `[contentrain] normalize: reuse ${scopeTarget} — patch ${filesModified.length} files (${patchesApplied} replacements)`
    await tx.commit(commitMsg)

    const gitResult = { branch: branchName, action: 'pending-review', commit: '' }
    try {
      const completed = await tx.complete()
      gitResult.action = completed.action
      gitResult.commit = completed.commit
    } catch {
      gitResult.action = 'pending-review'
    } finally {
      await tx.cleanup()
    }

    return {
      dry_run: false,
      results: {
        files_modified: filesModified,
        patches_applied: patchesApplied,
        patches_skipped: patchesSkipped,
        imports_added: importsAdded,
      },
      git: gitResult,
      next_steps: [
        'Run contentrain_validate to verify the patched files',
        patchesSkipped.length > 0 ? `${patchesSkipped.length} patches were skipped — review and retry if needed` : '',
        'Run contentrain_submit to push the branch for review',
      ].filter(Boolean),
    }
  } catch (error) {
    await tx.cleanup()
    throw error
  }
}

// ─── Patch Helpers ───

/**
 * Apply a single patch to a lines array. Mutates lines in place.
 * Uses line hint for proximity matching — searches ±10 lines from hint.
 */
function applyPatchToLines(lines: string[], patch: PatchEntry): boolean {
  const { line, old_value, new_expression } = patch
  const lineIdx = line - 1 // 0-based

  // Search range: ±10 lines from hint
  const searchStart = Math.max(0, lineIdx - 10)
  const searchEnd = Math.min(lines.length, lineIdx + 11)

  // First pass: exact line match
  if (lineIdx >= 0 && lineIdx < lines.length) {
    const replaced = replaceInLine(lines[lineIdx]!, old_value, new_expression)
    if (replaced !== null) {
      lines[lineIdx] = replaced
      return true
    }
  }

  // Second pass: proximity search
  for (let i = searchStart; i < searchEnd; i++) {
    if (i === lineIdx) continue // already tried
    const replaced = replaceInLine(lines[i]!, old_value, new_expression)
    if (replaced !== null) {
      lines[i] = replaced
      return true
    }
  }

  return false
}

/**
 * Replace old_value with new_expression in a single line.
 * Matches the string literal (quoted or unquoted tag text).
 * Returns the modified line, or null if not found.
 */
function replaceInLine(line: string, oldValue: string, newExpression: string): string | null {
  // Try exact match of the value in quoted strings
  // Match: "old_value", 'old_value', `old_value`
  for (const quote of ['"', "'", '`']) {
    const quoted = `${quote}${oldValue}${quote}`
    if (line.includes(quoted)) {
      return line.replace(quoted, newExpression)
    }
  }

  // Try unquoted tag text match: >old_value<
  if (line.includes(`>${oldValue}<`)) {
    return line.replace(`>${oldValue}<`, `>{${newExpression}}<`)
  }

  // Try plain text match (last resort)
  if (line.includes(oldValue)) {
    return line.replace(oldValue, newExpression)
  }

  return null
}

/**
 * Add import statements to the top of a file (after existing imports).
 * Deduplicates — won't add if the import already exists.
 * Returns number of imports actually added.
 */
function addImportsToLines(lines: string[], imports: Set<string>): number {
  let added = 0
  const existingContent = lines.join('\n')

  // Find the last import line position
  let lastImportIdx = -1
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim()
    if (trimmed.startsWith('import ') || trimmed.startsWith('import{')) {
      lastImportIdx = i
    }
    // Stop searching after a non-import, non-empty, non-comment line following imports
    if (lastImportIdx >= 0 && trimmed.length > 0 && !trimmed.startsWith('import') && !trimmed.startsWith('//') && !trimmed.startsWith('/*')) {
      break
    }
  }

  let insertAt: number
  if (lastImportIdx >= 0) {
    insertAt = lastImportIdx + 1
  } else {
    // No existing imports found — insert after shebang and directive lines
    insertAt = 0
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i]!.trim()
      if (i === 0 && trimmed.startsWith('#!')) {
        insertAt = i + 1
        continue
      }
      if (trimmed === "'use client'" || trimmed === '"use client"'
        || trimmed === "'use server'" || trimmed === '"use server"'
        || trimmed === "'use client';" || trimmed === '"use client";'
        || trimmed === "'use server';" || trimmed === '"use server";') {
        insertAt = i + 1
        continue
      }
      if (insertAt > 0 && trimmed.length > 0) break
      if (insertAt === 0 && trimmed.length > 0) break
    }
  }
  const toInsert: string[] = []

  for (const imp of imports) {
    // Check if this import already exists (by checking the from clause)
    if (!existingContent.includes(imp)) {
      toInsert.push(imp)
      added++
    }
  }

  if (toInsert.length > 0) {
    lines.splice(insertAt, 0, ...toInsert)
  }

  return added
}
