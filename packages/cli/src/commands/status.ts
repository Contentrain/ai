import { defineCommand } from 'citty'
import { intro, outro, log } from '@clack/prompts'
import { simpleGit } from 'simple-git'
import { readModel, countEntries } from '@contentrain/mcp/core/model-manager'
import { validateProject } from '@contentrain/mcp/core/validator'
import { resolveProjectRoot, loadProjectContext, requireInitialized } from '../utils/context.js'
import { pc, formatTable, formatPercent, formatCount } from '../utils/ui.js'

export default defineCommand({
  meta: {
    name: 'status',
    description: 'Show project status overview',
  },
  args: {
    root: { type: 'string', description: 'Project root path', required: false },
    json: { type: 'boolean', description: 'JSON output for CI', required: false },
  },
  async run({ args }) {
    const projectRoot = await resolveProjectRoot(args.root)
    const ctx = await loadProjectContext(projectRoot)

    if (args.json) {
      const jsonResult: Record<string, unknown> = {
        initialized: ctx.initialized,
        config: ctx.config,
        models: ctx.models,
        context: ctx.context,
      }

      if (ctx.initialized && ctx.config) {
        // Validation
        try {
          const validation = await validateProject(projectRoot, {})
          jsonResult['validation'] = {
            valid: validation.valid,
            errors: validation.summary.errors,
            warnings: validation.summary.warnings,
          }
        } catch { /* best effort */ }

        // Pending branches
        try {
          const git = simpleGit(projectRoot)
          const branches = await git.branch(['--list', 'contentrain/*'])
          jsonResult['pending_branches'] = branches.all
        } catch { /* best effort */ }
      }

      process.stdout.write(JSON.stringify(jsonResult, null, 2))
      return
    }

    intro(pc.bold('contentrain status'))

    if (!ctx.initialized) {
      log.warning('Project not initialized. Run `contentrain init` to get started.')
      outro('')
      return
    }

    requireInitialized(ctx)

    // Config summary
    log.info(pc.bold('Configuration'))
    log.message(`  Stack:    ${pc.cyan(ctx.config.stack)}`)
    log.message(`  Locales:  ${ctx.config.locales.supported.map(l => l === ctx.config.locales.default ? pc.green(`${l} (default)`) : l).join(', ')}`)
    log.message(`  Domains:  ${ctx.config.domains.join(', ')}`)
    log.message(`  Workflow: ${ctx.config.workflow === 'auto-merge' ? pc.green('auto-merge') : pc.yellow('review')}`)

    // Models table
    if (ctx.models.length > 0) {
      log.info(pc.bold(`\nModels (${ctx.models.length})`))

      const rows: string[][] = []
      for (const model of ctx.models) {
        const full = await readModel(projectRoot, model.id)
        if (!full) continue

        const counts = await countEntries(projectRoot, full)
        const defaultCount = counts.locales[ctx.config.locales.default] ?? 0

        // i18n completion
        let i18nStatus = '—'
        if (model.i18n && ctx.config.locales.supported.length > 1) {
          const completions = ctx.config.locales.supported
            .filter(l => l !== ctx.config.locales.default)
            .map(l => counts.locales[l] ?? 0)
          const avg = completions.length > 0
            ? completions.reduce((a, b) => a + b, 0) / completions.length
            : 0
          i18nStatus = formatPercent(avg, defaultCount)
        }

        rows.push([
          model.id,
          model.kind,
          model.domain,
          String(counts.total),
          model.i18n ? i18nStatus : '—',
        ])
      }

      log.message(formatTable(
        ['Model', 'Kind', 'Domain', 'Entries', 'i18n'],
        rows,
      ))
    } else {
      log.message('  No models yet. Run `contentrain init` with a template or create models.')
    }

    // Pending branches
    try {
      const git = simpleGit(projectRoot)
      const branches = await git.branch(['--list', 'contentrain/*'])
      if (branches.all.length > 0) {
        const count = branches.all.length
        if (count >= 80) {
          log.error(pc.bold(`\nBLOCKED: ${count} active contentrain branches (limit: 80)`))
          log.message(`  New writes are blocked. Merge or delete old branches with ${pc.cyan('contentrain diff')}.`)
        } else if (count >= 50) {
          log.warning(pc.bold(`\nWARNING: ${count} active contentrain branches (limit: 50)`))
          log.message(`  Consider merging or deleting old branches with ${pc.cyan('contentrain diff')}.`)
        } else {
          log.info(pc.bold(`\nPending branches (${count})`))
        }
        for (const branch of branches.all) {
          log.message(`  ${pc.yellow('●')} ${branch}`)
        }
        log.message(`  Run ${pc.cyan('contentrain diff')} to review.`)
      }
    } catch {
      // Git not available or no branches
    }

    // Last operation
    if (ctx.context?.lastOperation) {
      const op = ctx.context.lastOperation
      log.info(pc.bold('\nLast operation'))
      log.message(`  ${op.tool} → ${op.model || '(init)'} @ ${new Date(op.timestamp).toLocaleString()}`)
    }

    // Quick validation
    try {
      const result = await validateProject(projectRoot)
      if (result.summary.errors > 0) {
        log.warning(`\n${formatCount(result.summary.errors, 'validation error')}. Run ${pc.cyan('contentrain validate --fix')} to fix.`)
      } else {
        log.success('\nValidation: clean')
      }
    } catch {
      // Validation might fail if no models exist
    }

    outro('')
  },
})
