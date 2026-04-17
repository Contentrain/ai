import { defineCommand } from 'citty'
import { intro, outro, log, spinner, select, isCancel } from '@clack/prompts'
import { join } from 'node:path'
import { validateProject, type ValidateResult } from '@contentrain/mcp/core/validator'
import { createTransaction, buildBranchName } from '@contentrain/mcp/git/transaction'
import { writeContext } from '@contentrain/mcp/core/context'
import { contentrainDir } from '@contentrain/mcp/util/fs'
import { resolveProjectRoot, loadProjectContext, requireInitialized } from '../utils/context.js'
import { pc, severityColor, formatCount } from '../utils/ui.js'
import { debug } from '../utils/debug.js'

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
    watch: { type: 'boolean', description: 'Re-run validation when .contentrain/ changes (read-only, forces fix off)', required: false },
  },
  async run({ args }) {
    const projectRoot = await resolveProjectRoot(args.root)
    const ctx = await loadProjectContext(projectRoot)
    requireInitialized(ctx)

    if (args.watch) {
      // Watch mode is a dev-loop feature — re-run validation on every
      // change under .contentrain/ and print the new report. Fix /
      // interactive paths are disabled because they'd produce a fresh
      // cr/fix/* branch on every keystroke; read-only is the only
      // sensible posture for a polling loop.
      await runWatchMode(projectRoot, { model: args.model, json: Boolean(args.json) })
      return
    }

    if (!args.json) {
      intro(pc.bold('contentrain validate'))
    }

    const s = !args.json ? spinner() : null
    s?.start('Validating...')

    let result!: ValidateResult
    if (args.fix) {
      // Branch health gate
      const { checkBranchHealth } = await import('@contentrain/mcp/git/branch-lifecycle')
      const health = await checkBranchHealth(projectRoot)
      if (health.blocked) {
        s?.stop('Blocked')
        log.error(health.message!)
        outro('')
        process.exitCode = 1
        return
      }

      const branch = buildBranchName('fix', 'validate')
      const tx = await createTransaction(projectRoot, branch)
      let txResult: Awaited<ReturnType<typeof tx.complete>> | undefined
      try {
        await tx.write(async (wt) => {
          result = await validateProject(wt, { model: args.model, fix: true })
          await writeContext(wt, { tool: 'contentrain_validate', model: args.model ?? '*' })
        })
        await tx.commit('[contentrain] validate: auto-fix')
        txResult = await tx.complete()
      } finally {
        await tx.cleanup()
      }

      // Surface branch + workflow action to parity with the interactive
      // path. In review mode the fix lands on a cr/fix/... branch that
      // needs a manual merge; previously the non-interactive path
      // reported "done" without telling the caller where the fix went.
      if (txResult && result && result.fixed > 0) {
        if (txResult.action === 'pending-review') {
          log.info(`Fixes committed to branch ${pc.cyan(branch)} (pending review). Run ${pc.cyan('contentrain diff')} to merge.`)
        } else if (txResult.action === 'auto-merged') {
          log.success(`Fixes auto-merged into ${pc.cyan('contentrain')} (commit ${pc.dim(txResult.commit.slice(0, 8))}).`)
        }
        if (txResult.sync?.skipped?.length) {
          log.warning(`${txResult.sync.skipped.length} file(s) skipped during sync — you have uncommitted changes.`)
        }
      }
    } else {
      result = await validateProject(projectRoot, {
        model: args.model,
        fix: false,
      })
    }

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

          const fixBranch = buildBranchName('fix', 'validate')
          const fixTx = await createTransaction(projectRoot, fixBranch)
          let fixResult
          try {
            await fixTx.write(async (wt) => {
              fixResult = await validateProject(wt, { model: args.model, fix: true })
              await writeContext(wt, { tool: 'contentrain_validate', model: args.model ?? '*' })
            })
            await fixTx.commit('[contentrain] validate: interactive auto-fix')
            await fixTx.complete()
          } finally {
            await fixTx.cleanup()
          }

          fixS.stop(`Fixed ${fixResult!.fixed} issue(s)`)

          // In review workflow, fixes are on a branch — don't recheck base
          const { readConfig } = await import('@contentrain/mcp/core/config')
          const cfg = await readConfig(projectRoot)
          if (cfg?.workflow === 'review') {
            log.info(`Fixes committed to branch ${pc.cyan(fixBranch)}. Run ${pc.cyan('contentrain diff')} to review and merge.`)
          } else {
            // Auto-merge: fixes are on base, recheck is valid
            const recheck = await validateProject(projectRoot, { model: args.model })
            if (recheck.summary.errors === 0) {
              log.success('All errors resolved!')
            } else {
              log.warning(`${formatCount(recheck.summary.errors, 'error')} remaining (may need manual fix)`)
            }
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

/**
 * Watch `.contentrain/content/` + `.contentrain/models/` and re-run
 * validation on every change. Debounced 300ms (same as the serve
 * watcher) so a burst of writes produces one report, not one per file.
 * JSON mode prints one JSON object per run, newline-separated, so
 * line-oriented consumers (jq, tail -f) can process the stream.
 */
async function runWatchMode(
  projectRoot: string,
  options: { model?: string, json: boolean },
): Promise<void> {
  const { watch } = await import('chokidar')
  const crDir = contentrainDir(projectRoot)
  const targets = [join(crDir, 'content'), join(crDir, 'models'), join(crDir, 'config.json')]

  if (!options.json) {
    intro(pc.bold('contentrain validate --watch'))
    log.info('Watching .contentrain/ for changes (Ctrl+C to exit).')
  }

  let running = false
  let queued = false

  async function runOnce() {
    if (running) { queued = true; return }
    running = true
    try {
      debug('validate', 'running validateProject')
      const result = await validateProject(projectRoot, { model: options.model })
      if (options.json) {
        process.stdout.write(JSON.stringify(result) + '\n')
      } else {
        const e = result.summary.errors
        const w = result.summary.warnings
        const stamp = new Date().toLocaleTimeString()
        const headline = e === 0 && w === 0
          ? pc.green(`${stamp} — clean`)
          : `${stamp} — ${e > 0 ? pc.red(`${e} error${e === 1 ? '' : 's'}`) : '0 errors'}, ${w > 0 ? pc.yellow(`${w} warning${w === 1 ? '' : 's'}`) : '0 warnings'}`
        log.message(headline)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (options.json) {
        process.stdout.write(JSON.stringify({ error: message }) + '\n')
      } else {
        log.error(message)
      }
    } finally {
      running = false
      if (queued) { queued = false; void runOnce() }
    }
  }

  const watcher = watch(targets, {
    ignoreInitial: true,
    ignored: ['**/node_modules/**', '**/.git/**'],
  })

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  watcher.on('all', (eventType, filePath) => {
    debug('validate', `chokidar ${eventType} ${filePath}`)
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => { void runOnce() }, 300)
  })

  watcher.on('error', (err) => {
    const message = err instanceof Error ? err.message : String(err)
    if (options.json) {
      process.stdout.write(JSON.stringify({ watcherError: message }) + '\n')
    } else {
      log.error(`Watcher error: ${message}`)
    }
  })

  // Initial run.
  void runOnce()

  // Keep the process alive until the user quits. Watchers do not
  // count as Node event-loop refs reliably, so we park on an
  // unresolved promise and rely on SIGINT to tear everything down.
  await new Promise<void>((resolve) => {
    process.on('SIGINT', () => {
      void watcher.close()
      if (!options.json) log.info('\nStopped watching.')
      resolve()
    })
  })
}
