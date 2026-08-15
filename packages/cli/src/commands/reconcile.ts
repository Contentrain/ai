import { defineCommand } from 'citty'
import { intro, outro, log, select, isCancel } from '@clack/prompts'
import { resolveProjectRoot } from '../utils/context.js'
import { openMcpSession } from '../utils/mcp-client.js'
import { pc } from '../utils/ui.js'

interface ConflictRow {
  id: string
  path: string
  kind: string
  key?: string
  field?: string
  locale?: string
  ours?: unknown
  theirs?: unknown
  message: string
  suggested?: 'ours' | 'theirs'
}

interface ReconcileResponse {
  status: 'in_sync' | 'preview' | 'conflicts' | 'reconciled'
  message?: string
  base?: string
  commit?: string
  summary?: { files_merged?: number, entries_taken_ours?: number, entries_taken_theirs?: number, entries_field_merged?: number }
  changes?: Array<{ path: string, action: string }>
  conflicts?: ConflictRow[]
  advisories?: string[]
  error?: string
}

/**
 * Content-aware reconcile of a diverged contentrain ↔ base pair, wrapping
 * `contentrain_reconcile`. Flow: dry-run → show the plan → interactive
 * ours/theirs decisions for any conflicts → execute with the collected
 * resolutions. `--json` runs the dry-run and mirrors the tool response
 * verbatim; `--yes` executes a CLEAN plan without prompting (conflicts
 * still stop it — a content decision is never defaulted).
 */
export default defineCommand({
  meta: {
    name: 'reconcile',
    description: 'Merge a diverged base branch back into the content branch, content-aware',
  },
  args: {
    root: { type: 'string', description: 'Project root path', required: false },
    yes: { type: 'boolean', description: 'Execute without prompting when the plan has no conflicts', required: false },
    json: { type: 'boolean', description: 'Emit the dry-run plan as raw JSON for scripts', required: false },
  },
  async run({ args }) {
    const projectRoot = await resolveProjectRoot(args.root)
    const session = await openMcpSession(projectRoot)

    try {
      const preview = await session.call<ReconcileResponse>('contentrain_reconcile', { dry_run: true })

      if (args.json) {
        process.stdout.write(JSON.stringify(preview, null, 2))
        if (preview.error) process.exitCode = 1
        return
      }

      intro(pc.bold('contentrain reconcile'))

      if (preview.error) {
        log.error(preview.error)
        process.exitCode = 1
        return
      }

      if (preview.status === 'in_sync') {
        log.success(preview.message ?? 'Branches are already reconciled.')
        outro('')
        return
      }

      const summary = preview.summary ?? {}
      log.info(pc.bold('Plan'))
      log.message(`  Files to merge:   ${summary.files_merged ?? 0}`)
      log.message(`  Taken from ${pc.cyan('contentrain')}: ${summary.entries_taken_ours ?? 0}`)
      log.message(`  Taken from ${preview.base ?? 'base'}:  ${summary.entries_taken_theirs ?? 0}`)
      log.message(`  Field-merged:     ${summary.entries_field_merged ?? 0}`)
      for (const change of preview.changes ?? []) {
        log.message(pc.dim(`    ${change.action === 'delete' ? '−' : '±'} ${change.path}`))
      }
      for (const advisory of preview.advisories ?? []) {
        log.warning(advisory)
      }

      const conflicts = preview.conflicts ?? []
      const resolutions: Array<{ id: string, choose: 'ours' | 'theirs' }> = []
      if (conflicts.length > 0) {
        log.warning(pc.bold(`${conflicts.length} conflict(s) need a decision`))
        for (const conflict of conflicts) {
          const where = [conflict.key, conflict.field, conflict.locale].filter(Boolean).join(' · ')
          const choice = await select({
            message: `${conflict.message}${where ? ` (${where})` : ''}`,
            options: [
              {
                value: 'theirs' as const,
                label: `Take ${preview.base ?? 'base'}${conflict.theirs !== undefined ? `: ${short(conflict.theirs)}` : ''}${conflict.suggested === 'theirs' ? pc.dim(' (suggested)') : ''}`,
              },
              {
                value: 'ours' as const,
                label: `Keep contentrain${conflict.ours !== undefined ? `: ${short(conflict.ours)}` : ''}${conflict.suggested === 'ours' ? pc.dim(' (suggested)') : ''}`,
              },
              { value: 'skip' as const, label: 'Decide later (leaves the divergence in place)' },
            ],
          })
          if (isCancel(choice)) {
            outro('Cancelled — nothing was written.')
            return
          }
          if (choice !== 'skip') resolutions.push({ id: conflict.id, choose: choice })
        }
        if (resolutions.length < conflicts.length) {
          log.warning(`${conflicts.length - resolutions.length} conflict(s) left undecided — run reconcile again when ready.`)
          outro('Nothing was written.')
          return
        }
      } else if (!args.yes) {
        const go = await select({
          message: `Merge ${preview.base ?? 'the base branch'} into contentrain and fast-forward it?`,
          options: [
            { value: 'yes' as const, label: 'Execute the plan' },
            { value: 'no' as const, label: 'Not now' },
          ],
        })
        if (isCancel(go) || go === 'no') {
          outro('Nothing was written.')
          return
        }
      }

      const result = await session.call<ReconcileResponse>('contentrain_reconcile', {
        dry_run: false,
        ...(resolutions.length > 0 ? { resolutions } : {}),
      })

      if (result.error) {
        log.error(result.error)
        process.exitCode = 1
        return
      }
      if (result.status === 'conflicts') {
        // Values moved between the dry-run and the decisions (another writer
        // landed) — the stale resolutions were dropped, ask again next run.
        log.warning(result.message ?? 'Conflicts changed since the preview — run reconcile again.')
        for (const advisory of result.advisories ?? []) log.message(pc.dim(`  ${advisory}`))
        process.exitCode = 1
        return
      }

      log.success(result.message ?? 'Reconciled.')
      if (result.commit) log.message(pc.dim(`  Merge commit ${result.commit.slice(0, 8)}`))
      for (const advisory of result.advisories ?? []) log.warning(advisory)
      outro('')
    } catch (error) {
      log.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    } finally {
      await session.close()
    }
  },
})

function short(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return text.length > 60 ? `${text.slice(0, 57)}…` : text
}
