import type { ValidationError, ModelDefinition, ContentrainConfig, EntryMeta } from '@contentrain/types'
import { detectSecrets } from '@contentrain/types'
import { join } from 'node:path'
import { rm } from 'node:fs/promises'
import { contentrainDir, readDir, readJson, readText, writeJson, writeText, pathExists } from '../../util/fs.js'
import { readConfig } from '../config.js'
import { listModels, readModel } from '../model-manager.js'
import { writeMeta } from '../meta-manager.js'
import { parseFrontmatter, resolveContentDir, resolveJsonFilePath, resolveMdFilePath, resolveLocaleStrategy } from '../content-manager.js'
import { validateContent } from './entry.js'
import { checkRelationIntegrity, type ResolvedTarget } from './relation-integrity.js'
import { validateScheduleFields } from './schedule.js'

// ─── Types ───

export interface ValidateOptions {
  model?: string
  fix?: boolean
}

export interface ValidateResult {
  valid: boolean
  summary: {
    errors: number
    warnings: number
    notices: number
    models_checked: number
    entries_checked: number
  }
  issues: ValidationError[]
  fixed: number
}

// ─── Shared field validation helpers ───

/**
 * Build a `resolveTarget` adapter for `checkRelationIntegrity` that walks
 * the project's filesystem. Mirrors the target-resolution shape the legacy
 * `checkRelation` used — collection targets return their entry object-map,
 * documents return a "slug exists" marker map, singletons and dictionaries
 * return null content so the checker skips key enforcement for them.
 */
function buildProjectTargetResolver(
  projectRoot: string,
): (targetModelId: string, targetLocale: string) => Promise<ResolvedTarget> {
  return async (targetModelId, targetLocale) => {
    const targetModel = await readModel(projectRoot, targetModelId)
    if (!targetModel) return { exists: false }

    if (targetModel.kind === 'document') {
      const docContentDir = resolveContentDir(projectRoot, targetModel)
      const slugs = await discoverDocumentSlugs(docContentDir, targetModel)
      return { exists: true, content: Object.fromEntries(slugs.map(s => [s, true])) }
    }
    if (targetModel.kind === 'singleton' || targetModel.kind === 'dictionary') {
      return { exists: true, content: null }
    }
    // Collection: return empty object when the locale file is missing so
    // broken-ref detection still fires (legacy parity with `checkRelation`).
    const targetDir = resolveContentDir(projectRoot, targetModel)
    const targetData = await readJson<Record<string, unknown>>(
      resolveJsonFilePath(targetDir, targetModel, targetLocale),
    )
    return { exists: true, content: targetData ?? {} }
  }
}

/**
 * Scan an entry's data fields for detected secrets in UNDECLARED keys —
 * the legacy validator also flagged stray/rogue fields that were not in
 * `model.fields`. `validateContent` only knows about declared fields, so
 * this complementary pass preserves that coverage.
 */
function scanUndeclaredFieldsForSecrets(
  data: Record<string, unknown>,
  declared: Record<string, unknown> | undefined,
  ctx: { model: string, locale: string, entry?: string, slug?: string },
  issues: ValidationError[],
): void {
  for (const [fieldName, value] of Object.entries(data)) {
    if (declared && fieldName in declared) continue
    if (detectSecrets(value).length > 0) {
      issues.push({
        severity: 'error',
        ...ctx,
        field: fieldName,
        message: `Potential secret detected in field "${fieldName}"`,
      })
    }
  }
}

// ─── Per-model validators ───

async function validateCollectionModel(
  projectRoot: string,
  model: ModelDefinition,
  config: ContentrainConfig,
  issues: ValidationError[],
  fix: boolean,
): Promise<{ entries: number; fixed: number }> {
  let entriesChecked = 0
  let fixed = 0
  const cDir = resolveContentDir(projectRoot, model)
  const metaDir = join(contentrainDir(projectRoot), 'meta', model.id)
  const locales = config.locales.supported

  // Collect all entry IDs per locale for parity check
  const localeEntryIds: Record<string, Set<string>> = {}
  const allEntryIds = new Set<string>()

  const resolveTarget = buildProjectTargetResolver(projectRoot)

  for (const locale of locales) {
    const filePath = resolveJsonFilePath(cDir, model, locale)
    const data = await readJson<Record<string, Record<string, unknown>>>(filePath)
    if (!data) {
      if (model.i18n) {
        issues.push({
          severity: 'error',
          model: model.id,
          locale,
          message: `Locale file missing: ${locale}.json`,
        })

        if (fix) {
          await writeJson(filePath, {})
          fixed++
        }
      }
      continue
    }

    const ids = new Set(Object.keys(data))
    localeEntryIds[locale] = ids
    for (const id of ids) allEntryIds.add(id)

    // Check canonical sort
    const keys = Object.keys(data)
    const sorted = [...keys].toSorted()
    if (keys.join(',') !== sorted.join(',')) {
      issues.push({
        severity: 'warning',
        model: model.id,
        locale,
        message: 'Content file keys not in canonical order',
      })
      if (fix) {
        const resorted: Record<string, Record<string, unknown>> = {}
        for (const key of sorted) {
          resorted[key] = data[key]!
        }
        await writeJson(filePath, resorted)
        fixed++
      }
    }

    // Validate each entry — validateContent covers secret/field/unique/email-url/
    // polymorphic/nested on declared fields; supplementary scans below catch
    // undeclared-field secrets and async relation integrity.
    for (const [entryId, fields] of Object.entries(data)) {
      entriesChecked++

      scanUndeclaredFieldsForSecrets(
        fields,
        model.fields,
        { model: model.id, locale, entry: entryId },
        issues,
      )

      if (!model.fields) continue

      const entryResult = validateContent(
        fields,
        model.fields,
        model.id,
        locale,
        entryId,
        { allEntries: data, currentEntryId: entryId },
      )
      issues.push(...entryResult.errors)

      const relationErrors = await checkRelationIntegrity(
        fields,
        model.fields,
        model.id,
        locale,
        entryId,
        async () => null,
        { severity: 'error', resolveTarget },
      )
      issues.push(...relationErrors)
    }
  }

  // Entry parity check (i18n)
  if (model.i18n && Object.keys(localeEntryIds).length > 1) {
    const localeKeys = Object.keys(localeEntryIds)
    for (let i = 1; i < localeKeys.length; i++) {
      const locA = localeKeys[0]!
      const locB = localeKeys[i]!
      const idsA = localeEntryIds[locA]!
      const idsB = localeEntryIds[locB]!

      for (const id of idsA) {
        if (!idsB.has(id)) {
          issues.push({
            severity: 'error',
            model: model.id,
            locale: locB,
            entry: id,
            message: `Entry parity: entry "${id}" exists in ${locA} but missing in ${locB}`,
          })
        }
      }
      for (const id of idsB) {
        if (!idsA.has(id)) {
          issues.push({
            severity: 'error',
            model: model.id,
            locale: locA,
            entry: id,
            message: `Entry parity: entry "${id}" exists in ${locB} but missing in ${locA}`,
          })
        }
      }
    }
  }

  // Orphan meta check
  for (const locale of locales) {
    const metaPath = join(metaDir, `${locale}.json`)
    const metaData = await readJson<Record<string, EntryMeta>>(metaPath)
    const contentData = await readJson<Record<string, unknown>>(resolveJsonFilePath(cDir, model, locale)) ?? {}

    // Forward check: meta entries without content + schedule validation
    if (metaData) {
      for (const metaEntryId of Object.keys(metaData)) {
        // Validate schedule fields on every meta entry
        validateScheduleFields(metaData[metaEntryId]!, { model: model.id, locale, entry: metaEntryId }, issues)

        if (!(metaEntryId in contentData)) {
          issues.push({
            severity: 'warning',
            model: model.id,
            locale,
            entry: metaEntryId,
            message: `Orphan meta: meta entry "${metaEntryId}" exists but content entry missing`,
          })
          if (fix) {
            delete metaData[metaEntryId]
            if (Object.keys(metaData).length > 0) {
              await writeJson(metaPath, metaData)
            } else {
              await rm(metaPath, { force: true })
            }
            fixed++
          }
        }
      }
    }

    // Reverse check: content entries without meta
    for (const entryId of Object.keys(contentData)) {
      if (!metaData || !(entryId in metaData)) {
        issues.push({
          severity: 'warning',
          model: model.id,
          locale,
          entry: entryId,
          message: `Orphan content: entry "${entryId}" has no metadata`,
        })
        if (fix) {
          await writeMeta(projectRoot, model, { locale, entryId }, {
            status: 'draft',
            source: 'import',
            updated_by: 'contentrain-mcp',
          })
          fixed++
        }
      }
    }
  }

  return { entries: entriesChecked, fixed }
}

async function validateSingletonModel(
  projectRoot: string,
  model: ModelDefinition,
  config: ContentrainConfig,
  issues: ValidationError[],
  fix: boolean,
): Promise<{ entries: number; fixed: number }> {
  let entriesChecked = 0
  let fixed = 0
  const cDir = resolveContentDir(projectRoot, model)

  for (const locale of config.locales.supported) {
    const filePath = resolveJsonFilePath(cDir, model, locale)
    const data = await readJson<Record<string, unknown>>(filePath)

    if (!data) {
      if (model.i18n) {
        issues.push({
          severity: 'error',
          model: model.id,
          locale,
          message: `Locale file missing: ${locale}.json`,
        })
        if (fix) {
          await writeJson(filePath, {})
          fixed++
        }
      }
      continue
    }

    entriesChecked++

    scanUndeclaredFieldsForSecrets(data, model.fields, { model: model.id, locale }, issues)

    if (model.fields) {
      const entryResult = validateContent(data, model.fields, model.id, locale)
      issues.push(...entryResult.errors)

      const resolveTarget = buildProjectTargetResolver(projectRoot)
      const relationErrors = await checkRelationIntegrity(
        data,
        model.fields,
        model.id,
        locale,
        undefined,
        async () => null,
        { severity: 'error', resolveTarget },
      )
      issues.push(...relationErrors)
    }

    // Canonical sort check
    const keys = Object.keys(data)
    const sorted = [...keys].toSorted()
    if (keys.join(',') !== sorted.join(',')) {
      issues.push({
        severity: 'warning',
        model: model.id,
        locale,
        message: 'Content file keys not in canonical order',
      })
      if (fix) {
        const resorted: Record<string, unknown> = {}
        for (const key of sorted) {
          resorted[key] = data[key]
        }
        await writeJson(filePath, resorted)
        fixed++
      }
    }

    // Validate schedule fields in singleton meta
    const singletonMetaPath = join(contentrainDir(projectRoot), 'meta', model.id, `${locale}.json`)
    const singletonMetaData = await readJson<EntryMeta>(singletonMetaPath)
    if (singletonMetaData) {
      validateScheduleFields(singletonMetaData, { model: model.id, locale }, issues)
    }
  }

  return { entries: entriesChecked, fixed }
}

async function validateDictionaryModel(
  projectRoot: string,
  model: ModelDefinition,
  config: ContentrainConfig,
  issues: ValidationError[],
  fix: boolean,
): Promise<{ entries: number; fixed: number }> {
  let entriesChecked = 0
  let fixed = 0
  const cDir = resolveContentDir(projectRoot, model)

  const localeKeys: Record<string, Set<string>> = {}

  for (const locale of config.locales.supported) {
    const filePath = resolveJsonFilePath(cDir, model, locale)
    const data = await readJson<Record<string, string>>(filePath)

    if (!data) {
      if (model.i18n) {
        issues.push({
          severity: 'error',
          model: model.id,
          locale,
          message: `Locale file missing: ${locale}.json`,
        })
        if (fix) {
          await writeJson(filePath, {})
          fixed++
        }
      }
      continue
    }

    entriesChecked++
    localeKeys[locale] = new Set(Object.keys(data))

    // Secret detection
    for (const [key, value] of Object.entries(data)) {
      if (detectSecrets(value).length > 0) {
        issues.push({
          severity: 'error',
          model: model.id,
          locale,
          field: key,
          message: `Potential secret detected in key "${key}"`,
        })
      }
    }

    // Duplicate value detection
    const valueToKeys = new Map<string, string[]>()
    for (const [key, value] of Object.entries(data)) {
      const arr = valueToKeys.get(value)
      if (arr) arr.push(key)
      else valueToKeys.set(value, [key])
    }
    for (const [value, dupeKeys] of valueToKeys) {
      if (dupeKeys.length > 1) {
        const truncated = value.length > 40 ? `${value.slice(0, 40)}...` : value
        issues.push({
          severity: 'warning',
          model: model.id,
          locale,
          message: `Duplicate value "${truncated}" mapped to ${dupeKeys.length} keys: [${dupeKeys.join(', ')}]`,
        })
      }
    }

    // Canonical sort check
    const keys = Object.keys(data)
    const sorted = [...keys].toSorted()
    if (keys.join(',') !== sorted.join(',')) {
      issues.push({
        severity: 'warning',
        model: model.id,
        locale,
        message: 'Content file keys not in canonical order',
      })
      if (fix) {
        const resorted: Record<string, string> = {}
        for (const key of sorted) {
          resorted[key] = data[key]!
        }
        await writeJson(filePath, resorted)
        fixed++
      }
    }
  }

  // Key parity check
  if (model.i18n && Object.keys(localeKeys).length > 1) {
    const localeNames = Object.keys(localeKeys)
    for (let i = 1; i < localeNames.length; i++) {
      const locA = localeNames[0]!
      const locB = localeNames[i]!
      const keysA = localeKeys[locA]!
      const keysB = localeKeys[locB]!

      for (const k of keysA) {
        if (!keysB.has(k)) {
          issues.push({
            severity: 'warning',
            model: model.id,
            locale: locB,
            field: k,
            message: `Key parity: key "${k}" exists in ${locA} but missing in ${locB}`,
          })
        }
      }
      for (const k of keysB) {
        if (!keysA.has(k)) {
          issues.push({
            severity: 'warning',
            model: model.id,
            locale: locA,
            field: k,
            message: `Key parity: key "${k}" exists in ${locB} but missing in ${locA}`,
          })
        }
      }
    }
  }

  return { entries: entriesChecked, fixed }
}

async function discoverDocumentSlugs(
  cDir: string,
  model: ModelDefinition,
): Promise<string[]> {
  const strategy = resolveLocaleStrategy(model)
  const entries = await readDir(cDir)

  // When i18n is disabled, documents are flat {slug}.md files
  if (!model.i18n) {
    return entries.filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, ''))
  }

  if (strategy === 'file') {
    // Each slug is a subdirectory
    return entries.filter(e => !e.startsWith('.'))
  }

  if (strategy === 'suffix') {
    // Files like {slug}.{locale}.md — extract unique slugs
    const slugs = new Set<string>()
    for (const f of entries) {
      if (!f.endsWith('.md')) continue
      // Remove last two dot-separated segments (.locale.md)
      const parts = f.replace(/\.md$/, '').split('.')
      if (parts.length >= 2) {
        parts.pop() // remove locale
        slugs.add(parts.join('.'))
      }
    }
    return [...slugs]
  }

  if (strategy === 'directory') {
    // Locale subdirectories contain {slug}.md files — collect slugs from all locale dirs
    const slugs = new Set<string>()
    for (const localeDir of entries) {
      if (localeDir.startsWith('.')) continue
      const files = await readDir(join(cDir, localeDir))
      for (const f of files) {
        if (f.endsWith('.md')) slugs.add(f.replace(/\.md$/, ''))
      }
    }
    return [...slugs]
  }

  // 'none' — {slug}.md files, no locale
  return entries.filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, ''))
}

async function validateDocumentModel(
  projectRoot: string,
  model: ModelDefinition,
  config: ContentrainConfig,
  issues: ValidationError[],
  fix: boolean,
): Promise<{ entries: number; fixed: number }> {
  let entriesChecked = 0
  let fixed = 0
  const cDir = resolveContentDir(projectRoot, model)

  if (!await pathExists(cDir)) return { entries: 0, fixed: 0 }

  const slugs = await discoverDocumentSlugs(cDir, model)
  const locales = config.locales.supported

  for (const slug of slugs) {
    if (slug.startsWith('.')) continue

    for (const locale of locales) {
      const filePath = resolveMdFilePath(cDir, model, locale, slug)
      const raw = await readText(filePath)

      if (!raw) {
        if (model.i18n) {
          issues.push({
            severity: 'warning',
            model: model.id,
            locale,
            slug,
            message: `Missing translation: document "${slug}" missing ${locale} locale file`,
          })
          if (fix) {
            // Create empty template
            const template = `---\nslug: ${slug}\n---\n`
            await writeText(filePath, template)
            fixed++
          }
        }
        continue
      }

      entriesChecked++
      const { frontmatter, body } = parseFrontmatter(raw)

      // Always scan undeclared frontmatter fields + body for secrets.
      scanUndeclaredFieldsForSecrets(
        frontmatter,
        // Treat `body` as a declared field so the undeclared-scan skips it; body
        // is scanned separately below.
        { ...model.fields, body: true } as Record<string, unknown>,
        { model: model.id, locale, slug },
        issues,
      )

      if (detectSecrets(body).length > 0) {
        issues.push({
          severity: 'error',
          model: model.id,
          locale,
          slug,
          field: 'body',
          message: 'Potential secret detected in document body',
        })
      }

      if (model.fields) {
        const fieldsWithoutBody = Object.fromEntries(
          Object.entries(model.fields).filter(([name]) => name !== 'body'),
        )
        const entryResult = validateContent(
          frontmatter,
          fieldsWithoutBody,
          model.id,
          locale,
        )
        for (const err of entryResult.errors) {
          issues.push({ ...err, slug })
        }

        const resolveTarget = buildProjectTargetResolver(projectRoot)
        const relationErrors = await checkRelationIntegrity(
          frontmatter,
          fieldsWithoutBody,
          model.id,
          locale,
          undefined,
          async () => null,
          { severity: 'error', resolveTarget },
        )
        for (const err of relationErrors) {
          issues.push({ ...err, slug })
        }
      }
    }
  }

  return { entries: entriesChecked, fixed }
}

// ─── Orphan content check ───

async function checkOrphanContent(
  projectRoot: string,
  validModelIds: Set<string>,
  issues: ValidationError[],
  _fix: boolean,
): Promise<number> {
  let fixed = 0
  const contentBase = join(contentrainDir(projectRoot), 'content')
  const domains = await readDir(contentBase)

  for (const domain of domains) {
    if (domain.startsWith('.')) continue
    const domainDir = join(contentBase, domain)
    const modelDirs = await readDir(domainDir)

    for (const modelDir of modelDirs) {
      if (modelDir.startsWith('.')) continue
      if (!validModelIds.has(modelDir)) {
        issues.push({
          severity: 'warning',
          model: modelDir,
          message: `Orphan content: content directory exists for deleted model "${modelDir}"`,
        })
      }
    }
  }

  return fixed
}

// ─── Main validation function ───

export async function validateProject(
  projectRoot: string,
  options?: ValidateOptions,
): Promise<ValidateResult> {
  const issues: ValidationError[] = []
  const fix = options?.fix ?? false
  let totalEntries = 0
  let totalFixed = 0
  let modelsChecked = 0

  const config = await readConfig(projectRoot)
  if (!config) {
    return {
      valid: false,
      summary: { errors: 1, warnings: 0, notices: 0, models_checked: 0, entries_checked: 0 },
      issues: [{ severity: 'error', message: 'Project not initialized: config.json missing' }],
      fixed: 0,
    }
  }

  const modelSummaries = await listModels(projectRoot)
  const validModelIds = new Set(modelSummaries.map(m => m.id))
  const modelsToCheck = options?.model
    ? modelSummaries.filter(m => m.id === options.model)
    : modelSummaries

  for (const summary of modelsToCheck) {
    const model = await readModel(projectRoot, summary.id)
    if (!model) continue

    modelsChecked++
    let result: { entries: number; fixed: number }

    switch (model.kind) {
      case 'collection':
        result = await validateCollectionModel(projectRoot, model, config, issues, fix)
        break
      case 'singleton':
        result = await validateSingletonModel(projectRoot, model, config, issues, fix)
        break
      case 'dictionary':
        result = await validateDictionaryModel(projectRoot, model, config, issues, fix)
        break
      case 'document':
        result = await validateDocumentModel(projectRoot, model, config, issues, fix)
        break
      default:
        result = { entries: 0, fixed: 0 }
    }

    totalEntries += result.entries
    totalFixed += result.fixed
  }

  // Orphan content check (only when checking all models)
  if (!options?.model) {
    totalFixed += await checkOrphanContent(projectRoot, validModelIds, issues, fix)
  }

  // Cross-dictionary duplicate value detection (only when checking all models)
  if (!options?.model) {
    const dictModels = modelsToCheck.filter(m => m.kind === 'dictionary')
    if (dictModels.length > 1) {
      const globalValueMap: Record<string, Map<string, Array<{ model: string; key: string }>>> = {}

      for (const summary of dictModels) {
        const model = await readModel(projectRoot, summary.id)
        if (!model) continue
        const cDir = resolveContentDir(projectRoot, model)

        for (const locale of config.locales.supported) {
          if (!globalValueMap[locale]) globalValueMap[locale] = new Map()
          const data = await readJson<Record<string, string>>(resolveJsonFilePath(cDir, model, locale))
          if (!data) continue

          for (const [key, value] of Object.entries(data)) {
            const refs = globalValueMap[locale]!.get(value)
            if (refs) refs.push({ model: model.id, key })
            else globalValueMap[locale]!.set(value, [{ model: model.id, key }])
          }
        }
      }

      for (const [locale, valueMap] of Object.entries(globalValueMap)) {
        for (const [value, refs] of valueMap) {
          const uniqueModels = new Set(refs.map(r => r.model))
          if (uniqueModels.size > 1) {
            const truncated = value.length > 40 ? `${value.slice(0, 40)}...` : value
            issues.push({
              severity: 'notice',
              locale,
              message: `Cross-model duplicate value "${truncated}" in ${refs.map(r => `${r.model}/${r.key}`).join(', ')}`,
            })
          }
        }
      }
    }
  }

  const errors = issues.filter(i => i.severity === 'error').length
  const warnings = issues.filter(i => i.severity === 'warning').length
  const notices = issues.filter(i => i.severity === 'notice').length

  return {
    valid: errors === 0,
    summary: {
      errors,
      warnings,
      notices,
      models_checked: modelsChecked,
      entries_checked: totalEntries,
    },
    issues,
    fixed: totalFixed,
  }
}
