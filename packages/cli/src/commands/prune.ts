import { defineCommand } from 'citty'
import { intro, outro, log, confirm, isCancel } from '@clack/prompts'
import { cleanupMergedBranches, pruneMergedRemoteBranches } from '@contentrain/mcp/git/branch-lifecycle'
import { resolveProjectRoot } from '../utils/context.js'
import { pc } from '../utils/ui.js'

/**
 * Batch cleanup of merged cr/* branches: local refs past their retention
 * period plus every merged copy left on the remote. The remote sweep is the
 * operator-facing drain for backlogs the per-merge cleanup could not remove
 * (e.g. branches merged before remote cleanup shipped, or after auth/offline
 * failures). Merged-state uses the same ancestry + patch-id classification
 * as the rest of the toolchain, so branches orphaned by a base-history
 * rewrite are still recognised.
 */
export default defineCommand({
  meta: {
    name: 'prune',
    description: 'Delete merged cr/* branches locally and on the remote',
  },
  args: {
    root: { type: 'string', description: 'Project root path', required: false },
    'dry-run': { type: 'boolean', description: 'Show what would be deleted without deleting anything', required: false },
    yes: { type: 'boolean', description: 'Skip confirmation prompt', required: false },
    json: { type: 'boolean', description: 'Machine-readable JSON output (mutates only with --yes)', required: false },
  },
  async run({ args }) {
    const projectRoot = await resolveProjectRoot(args.root)
    const dryRun = Boolean(args['dry-run'])
    const json = Boolean(args.json)

    // Preview the remote sweep first — it is also the reachability probe.
    const preview = await pruneMergedRemoteBranches(projectRoot, { dryRun: true })

    if (json) {
      // Non-interactive: mutate only when explicitly confirmed via --yes.
      if (dryRun || !args.yes) {
        console.log(JSON.stringify({ dry_run: true, remote: preview }, null, 2))
        return
      }
      const local = await cleanupMergedBranches(projectRoot)
      const remote = await pruneMergedRemoteBranches(projectRoot)
      console.log(JSON.stringify({ dry_run: false, local, remote }, null, 2))
      if (remote.errors.length > 0) process.exitCode = 1
      return
    }

    intro(pc.bold('contentrain prune'))

    if (preview.skipped === 'disabled') {
      log.info('Remote branch cleanup is disabled (remoteBranchCleanup: false in config.json).')
    } else if (preview.skipped === 'no-remote') {
      log.info('No git remote configured — only local merged branches will be pruned.')
    } else if (preview.skipped === 'offline') {
      log.warning(`Could not reach the remote: ${preview.errors[0] ?? 'unknown error'}`)
    } else if (preview.deleted.length === 0) {
      log.info('No merged cr/* branches on the remote.')
    } else {
      log.info(`${preview.deleted.length} merged cr/* branch(es) on the remote:`)
      for (const branch of preview.deleted) {
        log.message(pc.dim(`    ${branch}`))
      }
      if (preview.kept.length > 0) {
        log.message(pc.dim(`  (${preview.kept.length} unmerged branch(es) kept)`))
      }
    }

    if (dryRun) {
      log.message(pc.dim('Dry run — nothing deleted.'))
      outro('')
      return
    }

    if (!args.yes) {
      const ok = await confirm({ message: 'Prune merged branches (local past retention + the remote list above)?' })
      if (isCancel(ok) || !ok) {
        outro('')
        return
      }
    }

    const local = await cleanupMergedBranches(projectRoot)
    if (local.deleted > 0) {
      log.success(`Deleted ${local.deleted} local merged branch(es).`)
    } else {
      log.message(pc.dim('No local merged branches past retention.'))
    }

    if (!preview.skipped && preview.deleted.length > 0) {
      const remote = await pruneMergedRemoteBranches(projectRoot)
      if (remote.deleted.length > 0) {
        log.success(`Deleted ${remote.deleted.length} remote branch(es).`)
      }
      for (const err of remote.errors) {
        log.warning(err)
      }
      if (remote.errors.length > 0) process.exitCode = 1
    }

    outro('')
  },
})
