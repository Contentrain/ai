import { defineCommand } from 'citty'
import { intro, outro, log, spinner, select, isCancel } from '@clack/prompts'
import { validateProject } from '@contentrain/mcp/core/validator'
import { resolveProjectRoot, loadProjectContext, requireInitialized } from '../utils/context.js'
import { pc, severityColor, formatCount } from '../utils/ui.js'

export default defineCommand({
  meta: {
    name: 'validate',
    description: 'Validate project content against schemas',
  },
  args: {
    root: { type: 'string', description: 'Project root path', required: false },
    fix: { type: 'boolean', description: 'Auto-fix issues', required: false },
    interactive: { type: 'boolean', description: 'Interactive fix mode', required: false },
    json: { type: 'boolean', description: 'JSON output for CI', required: false },
    model: { type: 'string', description: 'Validate single model', required: false },
  },
  async run({ args }) {
    const projectRoot = await resolveProjectRoot(args.root)
    const ctx = await loadProjectContext(projectRoot)
    requireInitialized(ctx)

    if (!args.json) {
      intro(pc.bold('contentrain validate'))
    }

    const s = !args.json ? spinner() : null
    s?.start('Validating...')

    const result = await validateProject(projectRoot, {
      model: args.model,
      fix: args.fix,
    })

    s?.stop('Validation complete')

    // JSON output
    if (args.json) {
      process.stdout.write(JSON.stringify(result, null, 2))
      return
    }

    // Summary
    log.info(pc.bold('Summary'))
    log.message(`  Models checked:  ${result.summary.models_checked}`)
    log.message(`  Entries checked: ${result.summary.entries_checked}`)
    log.message(`  Errors:   ${result.summary.errors > 0 ? pc.red(String(result.summary.errors)) : pc.green('0')}`)
    log.message(`  Warnings: ${result.summary.warnings > 0 ? pc.yellow(String(result.summary.warnings)) : pc.green('0')}`)
    log.message(`  Notices:  ${result.summary.notices > 0 ? pc.blue(String(result.summary.notices)) : '0'}`)

    if (args.fix && result.fixed > 0) {
      log.success(`Fixed ${result.fixed} issue(s)`)
    }

    // Issues
    if (result.issues.length > 0) {
      log.info(pc.bold('\nIssues'))

      for (const issue of result.issues) {
        const color = severityColor(issue.severity)
        const prefix = color(`[${issue.severity.toUpperCase()}]`)
        const location = [issue.model, issue.field, issue.entry].filter(Boolean).join(' → ')
        log.message(`  ${prefix} ${location}: ${issue.message}`)
      }

      // Interactive mode
      if (args.interactive && result.issues.some(i => i.severity === 'error' || i.severity === 'warning')) {
        log.info('\n' + pc.bold('Interactive fix mode'))

        const fixChoice = await select({
          message: 'How would you like to proceed?',
          options: [
            { value: 'fix-all', label: 'Fix all auto-fixable issues' },
            { value: 'skip', label: 'Skip — I\'ll fix manually' },
          ],
        })

        if (!isCancel(fixChoice) && fixChoice === 'fix-all') {
          const fixS = spinner()
          fixS.start('Fixing issues...')

          const fixResult = await validateProject(projectRoot, {
            model: args.model,
            fix: true,
          })

          fixS.stop(`Fixed ${fixResult.fixed} issue(s)`)

          // Re-validate
          const recheck = await validateProject(projectRoot, { model: args.model })
          if (recheck.summary.errors === 0) {
            log.success('All errors resolved!')
          } else {
            log.warning(`${formatCount(recheck.summary.errors, 'error')} remaining (may need manual fix)`)
          }
        }
      }
    }

    if (result.valid) {
      outro(pc.green('Project is valid!'))
    } else {
      outro(pc.yellow(`${formatCount(result.summary.errors, 'error')}, ${formatCount(result.summary.warnings, 'warning')}`))
      if (!args.fix && !args.interactive) {
        log.message(`Run ${pc.cyan('contentrain validate --fix')} to auto-fix.`)
      }
    }
  },
})
