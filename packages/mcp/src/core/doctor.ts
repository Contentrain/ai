import { join } from 'node:path'
import { stat } from 'node:fs/promises'
import { simpleGit } from 'simple-git'
import type { ContentrainConfig, ModelDefinition } from '@contentrain/types'
import { readConfig } from './config.js'
import { listModels, readModel } from './model-manager.js'
import { resolveContentDir, resolveJsonFilePath, resolveLocaleStrategy } from './content-manager.js'
import { autoDetectSourceDirs, discoverFiles } from './scan-config.js'
import { checkBranchHealth } from '../git/branch-lifecycle.js'
import { contentrainDir, pathExists, readDir, readJson, readText } from '../util/fs.js'

/**
 * Doctor — project health report.
 *
 * The public entry point is `runDoctor(projectRoot, { usage? })`. It is
 * inherently local-filesystem work (Node version, git install, file
 * mtimes, orphan directory detection), so the MCP tool surface gates
 * it behind the `localWorktree` capability — same pattern as
 * `contentrain_setup` and normalize.
 *
 * The report is structured JSON so three consumers can share it:
 *
 * - The `contentrain doctor` CLI command pretty-prints the checks.
 * - The Serve UI `/api/doctor` route returns the report to the
 *   Dashboard's Doctor panel.
 * - Automation (CI, Studio) gets a deterministic JSON shape it can
 *   assert against.
 *
 * Usage analysis (`--usage`) is a heavier, opt-in branch — it scans
 * every source file in the repo for content-key references. Kept
 * behind the flag so the default doctor run stays fast.
 */

export type CheckSeverity = 'error' | 'warning' | 'info'

export interface DoctorCheck {
  name: string
  pass: boolean
  detail: string
  /**
   * `error` — default for failing checks. Blocks a clean bill of health.
   * `warning` — failing-but-not-blocking (e.g. pending branches above
   *   threshold, stale SDK client).
   * `info` — passed check; pure informational.
   */
  severity?: CheckSeverity
}

export interface UnusedKeyEntry {
  model: string
  kind: string
  key: string
  locale: string
}

export interface DuplicateValueEntry {
  model: string
  locale: string
  value: string
  keys: string[]
}

export interface MissingLocaleEntry {
  model: string
  key: string
  missingIn: string
}

export interface DoctorUsageAnalysis {
  unusedKeys: UnusedKeyEntry[]
  duplicateValues: DuplicateValueEntry[]
  missingLocaleKeys: MissingLocaleEntry[]
}

export interface DoctorReport {
  checks: DoctorCheck[]
  summary: {
    total: number
    passed: number
    failed: number
    warnings: number
  }
  /** Present only when `options.usage === true`. */
  usage?: DoctorUsageAnalysis
}

export interface RunDoctorOptions {
  /** Run heavier `--usage` analysis (unused keys, duplicates, locale gaps). */
  usage?: boolean
}

export async function runDoctor(
  projectRoot: string,
  options: RunDoctorOptions = {},
): Promise<DoctorReport> {
  const checks: DoctorCheck[] = []

  // ─── 1. Git installed ───
  try {
    const git = simpleGit(projectRoot)
    const version = await git.version()
    checks.push({
      name: 'Git',
      pass: true,
      detail: `v${version.major}.${version.minor}.${version.patch}`,
    })
  } catch {
    checks.push({ name: 'Git', pass: false, detail: 'Not installed or not in PATH', severity: 'error' })
  }

  // ─── 2. Git repo initialized ───
  const hasGit = await pathExists(join(projectRoot, '.git'))
  checks.push({
    name: 'Git repository',
    pass: hasGit,
    detail: hasGit ? projectRoot : 'No .git directory found',
    severity: hasGit ? undefined : 'error',
  })

  // ─── 3. Node version ───
  const nodeVersion = process.versions.node
  const [major] = nodeVersion.split('.').map(Number)
  const nodePass = (major ?? 0) >= 22
  checks.push({
    name: 'Node.js',
    pass: nodePass,
    detail: `v${nodeVersion}${nodePass ? '' : ' (requires ≥22)'}`,
    severity: nodePass ? undefined : 'error',
  })

  // ─── 4. .contentrain/ structure ───
  const crDir = contentrainDir(projectRoot)
  const hasCrDir = await pathExists(crDir)
  const hasConfig = await pathExists(join(crDir, 'config.json'))
  const hasModels = await pathExists(join(crDir, 'models'))
  const hasContent = await pathExists(join(crDir, 'content'))
  const structurePass = hasCrDir && hasConfig && hasModels && hasContent

  checks.push({
    name: '.contentrain/ structure',
    pass: structurePass,
    detail: !hasCrDir
      ? 'Not initialized — run `contentrain init`'
      : [
          hasConfig ? null : 'missing config.json',
          hasModels ? null : 'missing models/',
          hasContent ? null : 'missing content/',
        ].filter(Boolean).join(', ') || 'OK',
    severity: structurePass ? undefined : 'error',
  })

  // ─── 5. Config parseable ───
  let config: ContentrainConfig | null = null
  if (hasConfig) {
    config = await readConfig(projectRoot)
    checks.push({
      name: 'Config',
      pass: config !== null,
      detail: config
        ? `stack: ${config.stack}, locales: ${config.locales.supported.join(', ')}`
        : 'Failed to parse config.json',
      severity: config ? undefined : 'error',
    })
  }

  // ─── 6. Models all parseable ───
  if (hasCrDir) {
    try {
      const models = await listModels(projectRoot)
      const parseResults = await Promise.all(models.map(m => readModel(projectRoot, m.id)))
      const allParseable = parseResults.every(r => r !== null)
      checks.push({
        name: 'Models',
        pass: allParseable,
        detail: `${models.length} model(s)${allParseable ? ', all valid' : ', some failed to parse'}`,
        severity: allParseable ? undefined : 'error',
      })
    } catch {
      checks.push({ name: 'Models', pass: false, detail: 'Failed to read models', severity: 'error' })
    }
  }

  // ─── 7. Orphan content ───
  if (hasCrDir) {
    const orphans = await findOrphanContent(projectRoot)
    checks.push({
      name: 'Orphan content',
      pass: orphans.length === 0,
      detail: orphans.length === 0 ? 'None' : `Found: ${orphans.join(', ')}`,
      severity: orphans.length === 0 ? undefined : 'warning',
    })
  }

  // ─── 8. Stale contentrain branches ───
  if (hasGit) {
    try {
      const health = await checkBranchHealth(projectRoot)
      checks.push({
        name: 'Pending branches',
        pass: !health.blocked && !health.warning,
        detail: health.message
          ?? (health.unmerged === 0 ? 'None' : `${health.unmerged} active cr/* branch(es)`),
        severity: health.blocked ? 'error' : health.warning ? 'warning' : undefined,
      })
    } catch {
      checks.push({ name: 'Pending branches', pass: true, detail: 'Could not check' })
    }
  }

  // ─── 9. SDK client freshness ───
  const clientDir = join(crDir, 'client')
  const modelsDir = join(crDir, 'models')
  if (await pathExists(clientDir) && await pathExists(modelsDir)) {
    try {
      const [clientStat, modelsStat] = await Promise.all([stat(clientDir), stat(modelsDir)])
      const fresh = clientStat.mtimeMs >= modelsStat.mtimeMs
      checks.push({
        name: 'SDK client',
        pass: fresh,
        detail: fresh ? 'Up to date' : 'Stale — run `contentrain generate`',
        severity: fresh ? undefined : 'warning',
      })
    } catch {
      checks.push({ name: 'SDK client', pass: true, detail: 'Could not check' })
    }
  }

  // ─── 10–12. Usage analysis (optional) ───
  let usage: DoctorUsageAnalysis | undefined
  if (options.usage && hasCrDir && config) {
    const [unusedKeys, duplicateValues, missingLocaleKeys] = await Promise.all([
      analyzeUnusedKeys(projectRoot, config),
      analyzeDuplicateValues(projectRoot, config),
      analyzeMissingLocaleKeys(projectRoot, config),
    ])
    usage = { unusedKeys, duplicateValues, missingLocaleKeys }

    checks.push({
      name: 'Unused content keys',
      pass: unusedKeys.length === 0,
      detail: unusedKeys.length === 0
        ? 'All keys referenced in source'
        : `${unusedKeys.length} key(s) not referenced in source code`,
      severity: unusedKeys.length === 0 ? undefined : 'warning',
    })

    checks.push({
      name: 'Duplicate dictionary values',
      pass: duplicateValues.length === 0,
      detail: duplicateValues.length === 0
        ? 'No duplicate values'
        : `${duplicateValues.length} value(s) mapped to multiple keys`,
      severity: duplicateValues.length === 0 ? undefined : 'warning',
    })

    checks.push({
      name: 'Locale key coverage',
      pass: missingLocaleKeys.length === 0,
      detail: missingLocaleKeys.length === 0
        ? 'All locales have matching keys'
        : `${missingLocaleKeys.length} key(s) missing in some locales`,
      severity: missingLocaleKeys.length === 0 ? undefined : 'warning',
    })
  }

  const passed = checks.filter(c => c.pass).length
  const failed = checks.length - passed
  const warnings = checks.filter(c => !c.pass && c.severity === 'warning').length

  const report: DoctorReport = {
    checks,
    summary: { total: checks.length, passed, failed, warnings },
  }
  if (usage) report.usage = usage
  return report
}

async function findOrphanContent(projectRoot: string): Promise<string[]> {
  const crDir = contentrainDir(projectRoot)
  const models = await listModels(projectRoot)
  const orphans: string[] = []

  const knownContentDirs = new Set<string>()
  for (const m of models) {
    const full = await readModel(projectRoot, m.id)
    const modelForPath = full
      ? {
          ...full,
          content_path: full.content_path ?? (m as { content_path?: string }).content_path,
        }
      : {
          id: m.id,
          name: m.id,
          kind: m.kind,
          domain: m.domain,
          i18n: m.i18n,
          fields: {},
          content_path: (m as { content_path?: string }).content_path,
        }
    knownContentDirs.add(resolveContentDir(projectRoot, modelForPath))
  }

  const contentDir = join(crDir, 'content')
  if (await pathExists(contentDir)) {
    const domains = await readDir(contentDir)
    for (const domain of domains) {
      const domainDir = join(contentDir, domain)
      const entries = await readDir(domainDir)
      for (const entry of entries) {
        if (entry === '.gitkeep') continue
        const entryDir = join(domainDir, entry)
        if (!knownContentDirs.has(entryDir)) {
          orphans.push(`${domain}/${entry}`)
        }
      }
    }
  }

  for (const dir of knownContentDirs) {
    if (dir.startsWith(contentDir)) continue
    if (!await pathExists(dir)) {
      orphans.push(`(missing custom path) ${dir}`)
      continue
    }
    await readDir(dir)
  }

  return orphans
}

async function analyzeUnusedKeys(
  projectRoot: string,
  config: ContentrainConfig,
): Promise<UnusedKeyEntry[]> {
  const sourceDirs = await autoDetectSourceDirs(projectRoot)
  const files = await discoverFiles(projectRoot, { paths: sourceDirs })
  if (files.length === 0) return []

  const chunks = await Promise.all(
    files.map(async (relPath) => {
      const content = await readText(join(projectRoot, relPath))
      return content ?? ''
    }),
  )
  const allSource = chunks.join('\n')

  const models = await listModels(projectRoot)
  const defaultLocale = config.locales.default
  const unused: UnusedKeyEntry[] = []

  for (const m of models) {
    const fullModel = await readModel(projectRoot, m.id)
    if (!fullModel) continue

    const keys = await extractContentKeys(projectRoot, fullModel, defaultLocale)
    for (const key of keys) {
      if (!allSource.includes(key)) {
        unused.push({ model: m.id, kind: m.kind, key, locale: defaultLocale })
      }
    }
  }

  return unused
}

async function extractContentKeys(
  projectRoot: string,
  model: ModelDefinition,
  locale: string,
): Promise<string[]> {
  const cDir = resolveContentDir(projectRoot, model)
  if (!await pathExists(cDir)) return []

  switch (model.kind) {
    case 'dictionary': {
      const filePath = resolveJsonFilePath(cDir, model, locale)
      const data = await readJson<Record<string, string>>(filePath)
      return data ? Object.keys(data) : []
    }
    case 'collection': {
      const filePath = resolveJsonFilePath(cDir, model, locale)
      const data = await readJson<Record<string, Record<string, unknown>>>(filePath)
      return data ? Object.keys(data) : []
    }
    case 'document': {
      const strategy = resolveLocaleStrategy(model)
      const slugs: string[] = []
      if (!model.i18n) {
        const files = await readDir(cDir)
        for (const f of files) if (f.endsWith('.md')) slugs.push(f.replace('.md', ''))
      } else if (strategy === 'file') {
        const dirs = await readDir(cDir)
        for (const d of dirs) if (!d.startsWith('.')) slugs.push(d)
      } else if (strategy === 'suffix') {
        const files = await readDir(cDir)
        const suffix = `.${locale}.md`
        for (const f of files) if (f.endsWith(suffix)) slugs.push(f.slice(0, -suffix.length))
      } else if (strategy === 'directory') {
        const localeDir = join(cDir, locale)
        if (await pathExists(localeDir)) {
          const files = await readDir(localeDir)
          for (const f of files) if (f.endsWith('.md')) slugs.push(f.replace('.md', ''))
        }
      } else {
        const files = await readDir(cDir)
        for (const f of files) if (f.endsWith('.md')) slugs.push(f.replace('.md', ''))
      }
      return slugs
    }
    case 'singleton':
      return []
    default:
      return []
  }
}

async function analyzeDuplicateValues(
  projectRoot: string,
  config: ContentrainConfig,
): Promise<DuplicateValueEntry[]> {
  const models = await listModels(projectRoot)
  const result: DuplicateValueEntry[] = []

  for (const m of models) {
    if (m.kind !== 'dictionary') continue
    const fullModel = await readModel(projectRoot, m.id)
    if (!fullModel) continue

    const cDir = resolveContentDir(projectRoot, fullModel)
    for (const locale of config.locales.supported) {
      const filePath = resolveJsonFilePath(cDir, fullModel, locale)
      const data = await readJson<Record<string, string>>(filePath)
      if (!data) continue

      const valueToKeys = new Map<string, string[]>()
      for (const [key, value] of Object.entries(data)) {
        const arr = valueToKeys.get(value)
        if (arr) arr.push(key)
        else valueToKeys.set(value, [key])
      }

      for (const [value, keys] of valueToKeys) {
        if (keys.length > 1) {
          result.push({ model: m.id, locale, value, keys })
        }
      }
    }
  }

  return result
}

async function analyzeMissingLocaleKeys(
  projectRoot: string,
  config: ContentrainConfig,
): Promise<MissingLocaleEntry[]> {
  if (config.locales.supported.length < 2) return []

  const models = await listModels(projectRoot)
  const result: MissingLocaleEntry[] = []
  const defaultLocale = config.locales.default
  const otherLocales = config.locales.supported.filter(l => l !== defaultLocale)

  for (const m of models) {
    if (m.kind !== 'dictionary' && m.kind !== 'collection') continue
    if (!m.i18n) continue

    const fullModel = await readModel(projectRoot, m.id)
    if (!fullModel) continue

    const cDir = resolveContentDir(projectRoot, fullModel)
    const defaultPath = resolveJsonFilePath(cDir, fullModel, defaultLocale)
    const defaultData = await readJson<Record<string, unknown>>(defaultPath)
    if (!defaultData) continue
    const defaultKeys = new Set(Object.keys(defaultData))

    for (const locale of otherLocales) {
      const localePath = resolveJsonFilePath(cDir, fullModel, locale)
      const localeData = await readJson<Record<string, unknown>>(localePath)
      const localeKeys = localeData ? new Set(Object.keys(localeData)) : new Set<string>()

      for (const key of defaultKeys) {
        if (!localeKeys.has(key)) {
          result.push({ model: m.id, key, missingIn: locale })
        }
      }
    }
  }

  return result
}
