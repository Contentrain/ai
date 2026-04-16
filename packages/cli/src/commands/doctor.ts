import { defineCommand } from 'citty'
import { intro, outro, log, spinner } from '@clack/prompts'
import { simpleGit } from 'simple-git'
import { join } from 'node:path'
import { stat } from 'node:fs/promises'
import { listModels, readModel } from '@contentrain/mcp/core/model-manager'
import { resolveContentDir, resolveJsonFilePath, resolveLocaleStrategy } from '@contentrain/mcp/core/content-manager'
import { readConfig } from '@contentrain/mcp/core/config'
import { pathExists, contentrainDir, readDir, readJson, readText } from '@contentrain/mcp/util/fs'
import { autoDetectSourceDirs, discoverFiles } from '@contentrain/mcp/core/scan-config'
import type { ModelDefinition, ContentrainConfig } from '@contentrain/types'
import { resolveProjectRoot } from '../utils/context.js'
import { statusIcon, pc } from '../utils/ui.js'

interface CheckResult {
  name: string
  pass: boolean
  detail: string
}

export default defineCommand({
  meta: {
    name: 'doctor',
    description: 'Check project health and environment',
  },
  args: {
    root: { type: 'string', description: 'Project root path', required: false },
    usage: { type: 'boolean', description: 'Analyze content key usage in source files', required: false },
  },
  async run({ args }) {
    const projectRoot = await resolveProjectRoot(args.root)

    intro(pc.bold('contentrain doctor'))

    const s = spinner()
    s.start('Running health checks...')

    const checks: CheckResult[] = []

    // 1. Git installed
    try {
      const git = simpleGit(projectRoot)
      const version = await git.version()
      checks.push({ name: 'Git', pass: true, detail: `v${version.major}.${version.minor}.${version.patch}` })
    } catch {
      checks.push({ name: 'Git', pass: false, detail: 'Not installed or not in PATH' })
    }

    // 2. Git repo initialized
    const hasGit = await pathExists(join(projectRoot, '.git'))
    checks.push({
      name: 'Git repository',
      pass: hasGit,
      detail: hasGit ? projectRoot : 'No .git directory found',
    })

    // 3. Node version
    const nodeVersion = process.versions.node
    const [major] = nodeVersion.split('.').map(Number)
    checks.push({
      name: 'Node.js',
      pass: (major ?? 0) >= 22,
      detail: `v${nodeVersion}${(major ?? 0) < 22 ? ' (requires ≥22)' : ''}`,
    })

    // 4. .contentrain/ structure
    const crDir = contentrainDir(projectRoot)
    const hasCrDir = await pathExists(crDir)
    const hasConfig = await pathExists(join(crDir, 'config.json'))
    const hasModels = await pathExists(join(crDir, 'models'))
    const hasContent = await pathExists(join(crDir, 'content'))

    checks.push({
      name: '.contentrain/ structure',
      pass: hasCrDir && hasConfig && hasModels && hasContent,
      detail: !hasCrDir
        ? 'Not initialized — run `contentrain init`'
        : [
            hasConfig ? null : 'missing config.json',
            hasModels ? null : 'missing models/',
            hasContent ? null : 'missing content/',
          ].filter(Boolean).join(', ') || 'OK',
    })

    // 5. Config parseable
    if (hasConfig) {
      const config = await readConfig(projectRoot)
      checks.push({
        name: 'Config',
        pass: config !== null,
        detail: config ? `stack: ${config.stack}, locales: ${config.locales.supported.join(', ')}` : 'Failed to parse config.json',
      })
    }

    // 6. Models
    if (hasCrDir) {
      try {
        const models = await listModels(projectRoot)
        let allParseable = true
        for (const m of models) {
          const full = await readModel(projectRoot, m.id)
          if (!full) allParseable = false
        }
        checks.push({
          name: 'Models',
          pass: allParseable,
          detail: `${models.length} model(s)${allParseable ? ', all valid' : ', some failed to parse'}`,
        })
      } catch {
        checks.push({ name: 'Models', pass: false, detail: 'Failed to read models' })
      }
    }

    // 7. Orphan content (content dirs without matching model)
    if (hasCrDir) {
      const orphans = await findOrphanContent(projectRoot)
      checks.push({
        name: 'Orphan content',
        pass: orphans.length === 0,
        detail: orphans.length === 0 ? 'None' : `Found: ${orphans.join(', ')}`,
      })
    }

    // 8. Stale contentrain branches
    if (hasGit) {
      try {
        const git = simpleGit(projectRoot)
        const branches = await git.branch(['--list', 'contentrain/*'])
        const staleCount = branches.all.length
        checks.push({
          name: 'Pending branches',
          pass: staleCount < 50,
          detail: staleCount === 0 ? 'None'
            : staleCount >= 80 ? `${staleCount} branches (BLOCKED — limit: 80)`
            : staleCount >= 50 ? `${staleCount} branches (WARNING — limit: 50)`
            : `${staleCount} contentrain branch(es)`,
        })
      } catch {
        checks.push({ name: 'Pending branches', pass: true, detail: 'Could not check' })
      }
    }

    // 9. SDK client freshness
    const clientDir = join(crDir, 'client')
    const modelsDir = join(crDir, 'models')
    if (await pathExists(clientDir) && await pathExists(modelsDir)) {
      try {
        const clientStat = await stat(clientDir)
        const modelsStat = await stat(modelsDir)
        const fresh = clientStat.mtimeMs >= modelsStat.mtimeMs
        checks.push({
          name: 'SDK client',
          pass: fresh,
          detail: fresh ? 'Up to date' : 'Stale — run `contentrain generate`',
        })
      } catch {
        checks.push({ name: 'SDK client', pass: true, detail: 'Could not check' })
      }
    }

    // 10–12. Content usage analysis (--usage flag)
    let unusedKeysResult: UnusedKeyEntry[] = []
    let duplicateValuesResult: DuplicateValueEntry[] = []
    let missingLocaleResult: MissingLocaleEntry[] = []

    if (args.usage && hasCrDir && hasConfig) {
      s.message('Analyzing content key usage...')

      const config = await readConfig(projectRoot)
      if (config) {
        const [unused, dupes, missing] = await Promise.all([
          analyzeUnusedKeys(projectRoot, config),
          analyzeDuplicateValues(projectRoot, config),
          analyzeMissingLocaleKeys(projectRoot, config),
        ])

        unusedKeysResult = unused
        duplicateValuesResult = dupes
        missingLocaleResult = missing

        checks.push({
          name: 'Unused content keys',
          pass: unused.length === 0,
          detail: unused.length === 0
            ? 'All keys referenced in source'
            : `${unused.length} key(s) not referenced in source code`,
        })

        checks.push({
          name: 'Duplicate dictionary values',
          pass: dupes.length === 0,
          detail: dupes.length === 0
            ? 'No duplicate values'
            : `${dupes.length} value(s) mapped to multiple keys`,
        })

        checks.push({
          name: 'Locale key coverage',
          pass: missing.length === 0,
          detail: missing.length === 0
            ? 'All locales have matching keys'
            : `${missing.length} key(s) missing in some locales`,
        })
      }
    }

    s.stop('Health checks complete')

    // Display results
    const passed = checks.filter(c => c.pass).length
    const failed = checks.filter(c => !c.pass).length

    for (const check of checks) {
      log.message(`${statusIcon(check.pass)} ${pc.bold(check.name)}: ${check.detail}`)
    }

    // Detailed usage analysis output
    if (unusedKeysResult.length > 0) {
      log.message('')
      log.message(pc.bold('  Unused keys:'))
      const grouped = groupBy(unusedKeysResult, e => e.model)
      for (const [model, entries] of Object.entries(grouped)) {
        const keyList = entries.length <= 5
          ? entries.map(e => e.key).join(', ')
          : `${entries.slice(0, 5).map(e => e.key).join(', ')} (+${entries.length - 5} more)`
        log.message(`    ${pc.dim(model)}: ${pc.yellow(keyList)}`)
      }
    }

    if (duplicateValuesResult.length > 0) {
      log.message('')
      log.message(pc.bold('  Duplicate values:'))
      for (const dv of duplicateValuesResult.slice(0, 10)) {
        const truncated = dv.value.length > 30 ? `${dv.value.slice(0, 30)}...` : dv.value
        log.message(`    ${pc.dim(`${dv.model}/${dv.locale}`)}: ${pc.yellow(`"${truncated}"`)} → [${dv.keys.join(', ')}]`)
      }
      if (duplicateValuesResult.length > 10) {
        log.message(`    ... and ${duplicateValuesResult.length - 10} more`)
      }
    }

    if (missingLocaleResult.length > 0) {
      log.message('')
      log.message(pc.bold('  Missing translations:'))
      const grouped = groupBy(missingLocaleResult, e => `${e.model}/${e.missingIn}`)
      for (const [label, entries] of Object.entries(grouped)) {
        log.message(`    ${pc.dim(label)}: ${pc.yellow(`${entries.length} key(s)`)}`)
      }
    }

    if (failed === 0) {
      outro(pc.green(`All ${passed} checks passed!`))
    } else {
      outro(pc.yellow(`${passed} passed, ${failed} failed`))
    }
  },
})

async function findOrphanContent(projectRoot: string): Promise<string[]> {
  const crDir = contentrainDir(projectRoot)
  const models = await listModels(projectRoot)
  const orphans: string[] = []

  // Build set of known content directories from model definitions
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

  // Scan default content tree
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

  // Also verify custom content_path directories exist and are walked
  for (const dir of knownContentDirs) {
    if (dir.startsWith(contentDir)) continue

    if (!await pathExists(dir)) {
      orphans.push(`(missing custom path) ${dir}`)
      continue
    }

    // Walk custom directories too so orphan detection covers non-default content trees.
    await readDir(dir)
  }

  return orphans
}

// ─── Content usage analysis types ───

interface UnusedKeyEntry {
  model: string
  kind: string
  key: string
  locale: string
}

interface DuplicateValueEntry {
  model: string
  locale: string
  value: string
  keys: string[]
}

interface MissingLocaleEntry {
  model: string
  key: string
  missingIn: string
}

function groupBy<T>(arr: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {}
  for (const item of arr) {
    const key = keyFn(item)
    if (!result[key]) result[key] = []
    result[key]!.push(item)
  }
  return result
}

// ─── Unused keys: content keys not referenced in source files ───

async function analyzeUnusedKeys(
  projectRoot: string,
  config: ContentrainConfig,
): Promise<UnusedKeyEntry[]> {
  const sourceDirs = await autoDetectSourceDirs(projectRoot)
  const files = await discoverFiles(projectRoot, { paths: sourceDirs })

  if (files.length === 0) return []

  // Read all source files into a single string for fast substring search
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
        for (const f of files) {
          if (f.endsWith('.md')) slugs.push(f.replace('.md', ''))
        }
      } else if (strategy === 'file') {
        const dirs = await readDir(cDir)
        for (const d of dirs) {
          if (!d.startsWith('.')) slugs.push(d)
        }
      } else if (strategy === 'suffix') {
        const files = await readDir(cDir)
        const suffix = `.${locale}.md`
        for (const f of files) {
          if (f.endsWith(suffix)) slugs.push(f.slice(0, -suffix.length))
        }
      } else if (strategy === 'directory') {
        const localeDir = join(cDir, locale)
        if (await pathExists(localeDir)) {
          const files = await readDir(localeDir)
          for (const f of files) {
            if (f.endsWith('.md')) slugs.push(f.replace('.md', ''))
          }
        }
      } else {
        const files = await readDir(cDir)
        for (const f of files) {
          if (f.endsWith('.md')) slugs.push(f.replace('.md', ''))
        }
      }

      return slugs
    }

    case 'singleton':
      return []

    default:
      return []
  }
}

// ─── Duplicate values: different dictionary keys mapping to same value ───

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

// ─── Missing locale keys: keys present in default locale but absent in others ───

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

    // Read default locale keys
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
