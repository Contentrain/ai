import type { ModelDefinition, FieldDef } from '@contentrain/types'
import { join, extname } from 'node:path'
import { readText, writeText, pathExists } from '../util/fs.js'
import { readModel, writeModel, listModels } from './model-manager.js'
import { writeContent, resolveContentDir, resolveJsonFilePath, resolveMdFilePath, type ContentEntry } from './content-manager.js'
import { readConfig } from './config.js'
import { writeContext } from './context.js'
import { createTransaction, buildBranchName } from '../git/transaction.js'
import { checkBranchHealth } from '../git/branch-lifecycle.js'

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

export interface SyntaxError {
  file: string
  error: string
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
    framework_warnings?: Array<{ file: string; warning: string }>
    syntax_errors?: SyntaxError[]
  }
  git?: { branch: string; action: string; commit: string }
  next_steps: string[]
}

// ─── Constants ───

const MAX_PATCHES = 100

/** File extensions allowed for patching — scannable source files only */
export const PATCHABLE_EXTENSIONS = new Set([
  '.vue', '.tsx', '.jsx', '.ts', '.js', '.mjs', '.astro', '.svelte',
])

/** Directories that must never be patched */
const FORBIDDEN_PATH_SEGMENTS = new Set([
  '.contentrain', 'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
])

// ─── Framework Detection (Guardrail #2) ───

export type FileFramework = 'vue' | 'svelte' | 'jsx' | 'astro' | 'script'

export function detectFileFramework(filePath: string): FileFramework {
  const ext = extname(filePath).toLowerCase()
  switch (ext) {
    case '.vue': return 'vue'
    case '.svelte': return 'svelte'
    case '.tsx':
    case '.jsx': return 'jsx'
    case '.astro': return 'astro'
    case '.ts':
    case '.js':
    case '.mjs': return 'script'
    default: return 'script'
  }
}

/**
 * Validate that a replacement expression uses the correct template syntax
 * for the target file's framework. Returns a warning string or null.
 */
export function validateFrameworkExpression(
  filePath: string,
  newExpression: string,
  context: 'tag_text' | 'other',
): string | null {
  if (context !== 'tag_text') return null

  const framework = detectFileFramework(filePath)

  switch (framework) {
    case 'vue':
      if (!newExpression.includes('{{')) {
        return `Vue file "${filePath}": tag text expression "${newExpression}" does not contain "{{" — expected Vue template syntax like {{ $t('key') }}`
      }
      break
    case 'jsx':
      if (!newExpression.includes('{')) {
        return `JSX file "${filePath}": tag text expression "${newExpression}" does not contain "{" — expected JSX syntax like {t('key')}`
      }
      break
    case 'svelte':
      if (!newExpression.includes('{')) {
        return `Svelte file "${filePath}": tag text expression "${newExpression}" does not contain "{" — expected Svelte syntax like {$t('key')}`
      }
      break
    case 'astro':
      if (!newExpression.includes('{')) {
        return `Astro file "${filePath}": tag text expression "${newExpression}" does not contain "{" — expected Astro syntax like {t('key')}`
      }
      break
    case 'script':
      // Script files don't have template interpolation — warn if attempting tag text replacement
      return `Script file "${filePath}": tag text replacement not applicable for .ts/.js files`
  }

  return null
}

// ─── Scope Validation (Guardrail #1) ───

/**
 * Validate that a patch file path is safe and within allowed scope.
 * Returns an error message or null if valid.
 */
export function validatePatchPath(filePath: string): string | null {
  const normalizedPath = filePath.replace(/\\/g, '/')

  // Reject path traversal
  if (normalizedPath.includes('..')) {
    return `Path traversal detected: "${filePath}"`
  }

  // Reject absolute paths
  if (normalizedPath.startsWith('/')) {
    return `Absolute path not allowed: "${filePath}"`
  }

  // Reject forbidden directories
  const segments = normalizedPath.split('/')
  for (const seg of segments) {
    if (FORBIDDEN_PATH_SEGMENTS.has(seg)) {
      return `Patching files inside "${seg}/" is not allowed: "${filePath}"`
    }
  }

  // Reject non-scannable extensions
  const ext = extname(filePath).toLowerCase()
  if (!PATCHABLE_EXTENSIONS.has(ext)) {
    return `File extension "${ext}" is not patchable. Allowed: ${[...PATCHABLE_EXTENSIONS].join(', ')}. Path: "${filePath}"`
  }

  return null
}

// ─── Syntax Check (Guardrail #5) ───

/**
 * Perform a basic syntax check on a patched file.
 * Returns an error message or null if syntax appears valid.
 */
export function checkSyntax(filePath: string, content: string): string | null {
  const ext = extname(filePath).toLowerCase()

  switch (ext) {
    case '.ts':
    case '.tsx':
    case '.js':
    case '.jsx':
    case '.mjs':
      return checkJsSyntax(content)
    case '.vue':
      return checkVueSyntax(content)
    case '.svelte':
    case '.astro':
      return checkTagBalance(content)
    default:
      return null
  }
}

/**
 * Basic JS/TS syntax check: bracket/paren/brace balance + string literal closure.
 * This is intentionally conservative — it catches obvious breakage without
 * requiring a full parser.
 */
function checkJsSyntax(content: string): string | null {
  const stack: string[] = []
  const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' }
  let inString: string | null = null
  let escaped = false
  let inLineComment = false
  let inBlockComment = false

  for (let i = 0; i < content.length; i++) {
    const ch = content[i]!
    const next = content[i + 1]

    // Handle escape sequences inside strings
    if (escaped) {
      escaped = false
      continue
    }

    if (ch === '\\' && inString !== null) {
      escaped = true
      continue
    }

    // Line comment
    if (!inString && !inBlockComment && ch === '/' && next === '/') {
      inLineComment = true
      continue
    }
    if (inLineComment) {
      if (ch === '\n') inLineComment = false
      continue
    }

    // Block comment
    if (!inString && !inBlockComment && ch === '/' && next === '*') {
      inBlockComment = true
      i++ // skip *
      continue
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false
        i++ // skip /
      }
      continue
    }

    // String handling
    if (inString !== null) {
      if (ch === inString) {
        // Template literal allows multi-line, others don't
        inString = null
      } else if (inString !== '`' && ch === '\n') {
        return `Unterminated string literal near offset ${i}`
      }
      continue
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch
      continue
    }

    // Bracket matching
    if (ch === '(' || ch === '[' || ch === '{') {
      stack.push(ch)
    } else if (ch === ')' || ch === ']' || ch === '}') {
      const expected = pairs[ch]!
      if (stack.length === 0) {
        return `Unmatched closing "${ch}" near offset ${i}`
      }
      const top = stack.pop()!
      if (top !== expected) {
        return `Mismatched bracket: expected closing for "${top}" but found "${ch}" near offset ${i}`
      }
    }
  }

  if (inString !== null) {
    return `Unterminated string literal (opened with ${inString})`
  }

  if (stack.length > 0) {
    return `Unclosed bracket "${stack[stack.length - 1]}" — ${stack.length} unclosed bracket(s)`
  }

  return null
}

/**
 * Vue SFC syntax check: ensure <template>, <script>, <style> tags are balanced.
 */
function checkVueSyntax(content: string): string | null {
  const tagBalance = checkTagBalance(content)
  if (tagBalance) return tagBalance

  // Vue-specific: check that SFC root tags are present and balanced
  for (const tag of ['template', 'script']) {
    const openRe = new RegExp(`<${tag}[\\s>]`, 'g')
    const closeRe = new RegExp(`</${tag}>`, 'g')
    const opens = content.match(openRe)?.length ?? 0
    const closes = content.match(closeRe)?.length ?? 0
    if (opens !== closes) {
      return `Unbalanced <${tag}> tag: ${opens} opening vs ${closes} closing`
    }
  }

  return null
}

/**
 * Basic tag balance check for HTML-like files.
 * Checks that self-closing tags are handled and major structural tags are balanced.
 */
function checkTagBalance(content: string): string | null {
  // Check for common structural tags balance
  const structuralTags = ['div', 'section', 'main', 'header', 'footer', 'nav', 'article', 'aside', 'ul', 'ol', 'table']

  for (const tag of structuralTags) {
    const openRe = new RegExp(`<${tag}[\\s>]`, 'g')
    const closeRe = new RegExp(`</${tag}>`, 'g')
    const opens = content.match(openRe)?.length ?? 0
    const closes = content.match(closeRe)?.length ?? 0
    if (opens !== closes) {
      return `Unbalanced <${tag}> tag: ${opens} opening vs ${closes} closing`
    }
  }

  return null
}

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

    // Guardrail #3: Preview-Execute Parity — use real model metadata if it exists
    let previewModel: ModelDefinition
    if (existingIds.has(ext.model)) {
      const real = await readModel(projectRoot, ext.model)
      if (real) {
        previewModel = real
      } else {
        previewModel = { id: ext.model, kind: ext.kind, domain: ext.domain, i18n: ext.i18n ?? true } as ModelDefinition
      }
    } else {
      previewModel = { id: ext.model, kind: ext.kind, domain: ext.domain, i18n: ext.i18n ?? true } as ModelDefinition
    }

    const cDir = resolveContentDir(projectRoot, previewModel)
    for (const entry of ext.entries) {
      const locale = entry.locale ?? config.locales.default
      if (ext.kind === 'document' && entry.slug) {
        contentFiles.push(resolveMdFilePath(cDir, previewModel, locale, entry.slug))
      } else {
        contentFiles.push(resolveJsonFilePath(cDir, previewModel, locale))
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

  // Branch health gate
  const health = await checkBranchHealth(projectRoot)
  if (health.blocked) {
    return {
      error: health.message,
      action: 'blocked' as const,
      hint: 'Merge or delete old contentrain/* branches before executing normalize.',
    } as unknown as ExtractionResult
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

  // Guardrail #1: Scope Real Enforcement
  // Step 1: Path safety — every patch must target a valid, patchable source file
  for (const patch of patches) {
    const pathError = validatePatchPath(patch.file)
    if (pathError) {
      throw new Error(`Invalid patch path: ${pathError}`)
    }
  }

  // Step 2: Semantic scope — verify scope model/domain exists and cross-check patch files
  if (scope.model || scope.domain) {
    const models = await listModels(projectRoot)
    const scopeModels = scope.model
      ? models.filter(m => m.id === scope.model)
      : scope.domain
        ? models.filter(m => m.domain === scope.domain)
        : models

    if (scopeModels.length === 0) {
      throw new Error(`No models found for scope ${scope.model ? `model="${scope.model}"` : `domain="${scope.domain}"`}`)
    }

    // Step 3: Verify patch files are source files (not content/config/meta files)
    // and belong to detectable source directories (not random locations)
    const { autoDetectSourceDirs } = await import('./scan-config.js')
    const sourceDirs = await autoDetectSourceDirs(projectRoot)

    // Build allowed file prefixes from source dirs
    const allowedPrefixes = sourceDirs.map(d => d === '.' ? '' : d + '/')

    for (const patch of patches) {
      const normalizedPath = patch.file.replace(/\\/g, '/')

      // Reject patches targeting .contentrain/ directory (content files should never be patched by reuse)
      if (normalizedPath.startsWith('.contentrain/') || normalizedPath.includes('/.contentrain/')) {
        throw new Error(`Cannot patch content/config files directly: "${patch.file}". Reuse patches source files only.`)
      }

      // If source dirs were detected (not just "."), verify patch files are within them
      if (sourceDirs.length > 0 && sourceDirs[0] !== '.') {
        const inSourceDir = allowedPrefixes.some(prefix =>
          prefix === '' || normalizedPath.startsWith(prefix),
        )
        if (!inSourceDir) {
          throw new Error(
            `Patch file "${patch.file}" is outside detected source directories (${sourceDirs.join(', ')}). ` +
            `Reuse patches must target source files within the project's source tree.`,
          )
        }
      }
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

  // Branch health gate
  const reuseHealth = await checkBranchHealth(projectRoot)
  if (reuseHealth.blocked) {
    return {
      error: reuseHealth.message,
      action: 'blocked' as const,
      hint: 'Merge or delete old contentrain/* branches before executing reuse.',
    } as unknown as ReuseResult
  }

  // Execute — git transaction
  const scopeTarget = scope.model ?? scope.domain!
  const branchName = buildBranchName('normalize/reuse', scopeTarget)
  const tx = await createTransaction(projectRoot, branchName, { workflowOverride: 'review' })

  const filesModified: string[] = []
  let patchesApplied = 0
  let importsAdded = 0
  const patchesSkipped: Array<{ file: string; line: number; reason: string }> = []
  const frameworkWarnings: Array<{ file: string; warning: string }> = []
  const syntaxErrors: SyntaxError[] = []

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

        const content = await readText(absPath)
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
          // Determine replacement context before applying
          const targetLine = lines[patch.line - 1] ?? ''
          const isTagTextContext = targetLine.includes(`>${patch.old_value}<`)
          const replacementContext = isTagTextContext ? 'tag_text' as const : 'other' as const

          // Guardrail #2: Framework-aware validation — only warn for tag text replacements
          if (isTagTextContext) {
            const fwWarning = validateFrameworkExpression(relFile, patch.new_expression, replacementContext)
            if (fwWarning) {
              frameworkWarnings.push({ file: relFile, warning: fwWarning })
            }
          }

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
          const newContent = lines.join('\n')
          await writeText(absPath, newContent)
          filesModified.push(relFile)

          // Guardrail #5: Syntax check after patching
          const syntaxError = checkSyntax(relFile, newContent)
          if (syntaxError) {
            syntaxErrors.push({ file: relFile, error: syntaxError })
          }
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
          framework_warnings: frameworkWarnings.length > 0 ? frameworkWarnings : undefined,
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
        framework_warnings: frameworkWarnings.length > 0 ? frameworkWarnings : undefined,
        syntax_errors: syntaxErrors.length > 0 ? syntaxErrors : undefined,
      },
      git: gitResult,
      next_steps: [
        'Run contentrain_validate to verify the patched files',
        patchesSkipped.length > 0 ? `${patchesSkipped.length} patches were skipped — review and retry if needed` : '',
        syntaxErrors.length > 0 ? `WARNING: ${syntaxErrors.length} file(s) may have syntax errors after patching — review manually` : '',
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
 *
 * Guardrail #4: Safer patch matching — word boundary awareness and
 * ambiguity rejection for plain text fallback.
 */
export function replaceInLine(line: string, oldValue: string, newExpression: string): string | null {
  // Try exact match of the value in quoted strings
  // Match: "old_value", 'old_value', `old_value`
  for (const quote of ['"', "'", '`']) {
    const quoted = `${quote}${oldValue}${quote}`
    if (line.includes(quoted)) {
      return line.replace(quoted, newExpression)
    }
  }

  // Try unquoted tag text match: >old_value<
  // The agent provides the complete new_expression with correct framework syntax:
  //   JSX:    {t('key')}
  //   Vue:    {{ $t('key') }}
  //   Svelte: {$t('key')}
  // So we insert the expression as-is between > and <, without wrapping in braces.
  if (line.includes(`>${oldValue}<`)) {
    return line.replace(`>${oldValue}<`, `>${newExpression}<`)
  }

  // Guardrail #4: Safer plain text fallback
  // Only match if old_value appears at a word boundary and is unambiguous
  if (line.includes(oldValue)) {
    // Count occurrences — if multiple, it's ambiguous
    const occurrences = countOccurrences(line, oldValue)
    if (occurrences > 1) {
      return null // ambiguous — let proximity search handle it
    }

    // Word boundary check: don't replace "Submit" inside "SubmitButton"
    // Reject if the old_value is a substring of a larger word — check if
    // adjacent characters are word characters that extend the token.
    const idx = line.indexOf(oldValue)
    const charBefore = idx > 0 ? line[idx - 1]! : ''
    const charAfter = idx + oldValue.length < line.length ? line[idx + oldValue.length]! : ''

    const oldStartsWithWord = oldValue.length > 0 && isWordChar(oldValue[0]!)
    const oldEndsWithWord = oldValue.length > 0 && isWordChar(oldValue[oldValue.length - 1]!)

    // If old_value starts with a word char and char before is also word char, it's a partial match
    if (oldStartsWithWord && isWordChar(charBefore)) {
      return null
    }
    // If old_value ends with a word char and char after is also word char, it's a partial match
    if (oldEndsWithWord && isWordChar(charAfter)) {
      return null
    }

    return line.replace(oldValue, newExpression)
  }

  return null
}

/** Count non-overlapping occurrences of a substring */
function countOccurrences(str: string, sub: string): number {
  let count = 0
  let pos = 0
  while (pos <= str.length - sub.length) {
    const idx = str.indexOf(sub, pos)
    if (idx === -1) break
    count++
    pos = idx + sub.length
  }
  return count
}

/** Check if a character is a word character (letter, digit, underscore) */
function isWordChar(ch: string): boolean {
  return /\w/.test(ch)
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
