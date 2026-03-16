import { defineCommand } from 'citty'
import { intro, outro, log, spinner } from '@clack/prompts'
import { simpleGit } from 'simple-git'
import { join } from 'node:path'
import { stat } from 'node:fs/promises'
import { listModels, readModel } from '@contentrain/mcp/core/model-manager'
import { resolveContentDir } from '@contentrain/mcp/core/content-manager'
import { readConfig } from '@contentrain/mcp/core/config'
import { pathExists, contentrainDir, readDir } from '@contentrain/mcp/util/fs'
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

    s.stop('Health checks complete')

    // Display results
    const passed = checks.filter(c => c.pass).length
    const failed = checks.filter(c => !c.pass).length

    for (const check of checks) {
      log.message(`${statusIcon(check.pass)} ${pc.bold(check.name)}: ${check.detail}`)
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
