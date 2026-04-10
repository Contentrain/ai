import type { ValidationError, ModelDefinition, ContentrainConfig, FieldDef, EntryMeta } from '@contentrain/types'
import { detectSecrets, validateFieldValue } from '@contentrain/types'
import { join } from 'node:path'
import { rm } from 'node:fs/promises'
import { contentrainDir, readDir, readJson, readText, writeJson, writeText, pathExists } from '../util/fs.js'
import { readConfig } from './config.js'
import { listModels, readModel } from './model-manager.js'
import { writeMeta } from './meta-manager.js'
import { parseFrontmatter, resolveContentDir, resolveJsonFilePath, resolveMdFilePath, resolveLocaleStrategy } from './content-manager.js'

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

// ─── Schedule validation ───

function validateScheduleFields(
  meta: EntryMeta,
  ctx: { model: string; locale: string; entry?: string; slug?: string },
  issues: ValidationError[],
): void {
  if (meta.publish_at !== undefined) {
    const d = new Date(meta.publish_at)
    if (Number.isNaN(d.getTime())) {
      issues.push({
        severity: 'error',
        ...ctx,
        message: `Invalid publish_at date: "${meta.publish_at}". Must be a valid ISO 8601 date string.`,
      })
    }
  }
  if (meta.expire_at !== undefined) {
    const d = new Date(meta.expire_at)
    if (Number.isNaN(d.getTime())) {
      issues.push({
        severity: 'error',
        ...ctx,
        message: `Invalid expire_at date: "${meta.expire_at}". Must be a valid ISO 8601 date string.`,
      })
    }
  }
  if (meta.publish_at !== undefined && meta.expire_at !== undefined) {
    const pubDate = new Date(meta.publish_at)
    const expDate = new Date(meta.expire_at)
    if (!Number.isNaN(pubDate.getTime()) && !Number.isNaN(expDate.getTime()) && expDate <= pubDate) {
      issues.push({
        severity: 'error',
        ...ctx,
        message: `expire_at ("${meta.expire_at}") must be after publish_at ("${meta.publish_at}").`,
      })
    }
  }
}

// ─── Shared field validation ───

interface FieldContext {
  model: string
  locale: string
  entry?: string
  slug?: string
}

async function checkRelation(
  projectRoot: string,
  fieldName: string,
  fieldDef: FieldDef,
  value: unknown,
  locale: string,
  ctx: FieldContext,
  issues: ValidationError[],
): Promise<void> {
  if ((fieldDef.type !== 'relation' && fieldDef.type !== 'relations') || value === undefined || value === null) return

  const targets = Array.isArray(fieldDef.model) ? fieldDef.model : fieldDef.model ? [fieldDef.model] : []
  const refs = fieldDef.type === 'relations' && Array.isArray(value) ? value : [value]

  for (const ref of refs) {
    if (typeof ref !== 'string') continue
    let found = false
    for (const targetModelId of targets) {
      const targetModel = await readModel(projectRoot, targetModelId)
      if (!targetModel) {
        issues.push({
          severity: 'error',
          ...ctx,
          field: fieldName,
          message: `Broken relation: target model "${targetModelId}" not found`,
        })
        found = true
        break
      }

      if (targetModel.kind === 'document') {
        // Document relations reference by slug — use locale-strategy-aware discovery
        const docContentDir = resolveContentDir(projectRoot, targetModel)
        const slugs = await discoverDocumentSlugs(docContentDir, targetModel)
        if (slugs.includes(ref)) {
          found = true
          break
        }
      } else if (targetModel.kind === 'singleton' || targetModel.kind === 'dictionary') {
        // Relations to singletons/dictionaries are unusual but shouldn't error
        found = true
        break
      } else {
        // Collection: validate against entry IDs (object-map keys)
        const targetDir = resolveContentDir(projectRoot, targetModel)
        const targetData = await readJson<Record<string, unknown>>(
          resolveJsonFilePath(targetDir, targetModel, locale),
        )
        if (targetData && ref in targetData) {
          found = true
          break
        }
      }
    }
    if (!found) {
      issues.push({
        severity: 'error',
        ...ctx,
        field: fieldName,
        message: `Broken relation: referenced ${targets.some(t => t) ? 'ref' : 'ID'} "${ref}" not found in target model(s)`,
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

  // Collect unique values for unique constraint check
  const uniqueFieldValues: Record<string, Map<string, string>> = {}

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

    // Validate each entry
    for (const [entryId, fields] of Object.entries(data)) {
      entriesChecked++

      // Secret detection
      for (const [fieldName, value] of Object.entries(fields)) {
        if (detectSecrets(value).length > 0) {
          issues.push({
            severity: 'error',
            model: model.id,
            locale,
            entry: entryId,
            field: fieldName,
            message: `Potential secret detected in field "${fieldName}"`,
          })
        }
      }

      if (!model.fields) continue

      // Field-level validation
      for (const [fieldName, fieldDef] of Object.entries(model.fields)) {
        const value = fields[fieldName]

        // Field schema validation (type, required, min/max, pattern, select)
        const fieldErrors = validateFieldValue(value, fieldDef)
        for (const err of fieldErrors) {
          issues.push({ ...err, model: model.id, locale, entry: entryId, field: fieldName })
        }

        // Unique constraint
        if (fieldDef.unique && value !== undefined && value !== null) {
          const key = `${fieldName}:${locale}`
          if (!uniqueFieldValues[key]) uniqueFieldValues[key] = new Map()
          const existing = uniqueFieldValues[key]!.get(String(value))
          if (existing) {
            issues.push({
              severity: 'error',
              model: model.id,
              locale,
              entry: entryId,
              field: fieldName,
              message: `Duplicate value "${value}" violates unique constraint (also in entry "${existing}")`,
            })
          } else {
            uniqueFieldValues[key]!.set(String(value), entryId)
          }
        }

        // Broken relation
        await checkRelation(projectRoot, fieldName, fieldDef, value, locale, { model: model.id, locale, entry: entryId }, issues)
      }
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

    // Secret detection
    for (const [fieldName, value] of Object.entries(data)) {
      if (detectSecrets(value).length > 0) {
        issues.push({
          severity: 'error',
          model: model.id,
          locale,
          field: fieldName,
          message: `Potential secret detected in field "${fieldName}"`,
        })
      }
    }

    // Field validation
    if (model.fields) {
      for (const [fieldName, fieldDef] of Object.entries(model.fields)) {
        const value = data[fieldName]

        // Field schema validation (type, required, min/max, pattern, select)
        const sFieldErrors = validateFieldValue(value, fieldDef)
        for (const err of sFieldErrors) {
          issues.push({ ...err, model: model.id, locale, field: fieldName })
        }

        // Broken relation
        await checkRelation(projectRoot, fieldName, fieldDef, value, locale, { model: model.id, locale }, issues)
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

      // Secret detection in frontmatter
      for (const [fieldName, value] of Object.entries(frontmatter)) {
        if (detectSecrets(value).length > 0) {
          issues.push({
            severity: 'error',
            model: model.id,
            locale,
            slug,
            field: fieldName,
            message: `Potential secret detected in field "${fieldName}"`,
          })
        }
      }

      // Secret detection in body
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

      // Field validation
      if (model.fields) {
        for (const [fieldName, fieldDef] of Object.entries(model.fields)) {
          if (fieldName === 'body') continue
          const value = frontmatter[fieldName]

          // Field schema validation (type, required, min/max, pattern, select)
          const dFieldErrors = validateFieldValue(value, fieldDef)
          for (const err of dFieldErrors) {
            issues.push({ ...err, model: model.id, locale, slug, field: fieldName })
          }

          // Broken relation
          await checkRelation(projectRoot, fieldName, fieldDef, value, locale, { model: model.id, locale, slug }, issues)
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
