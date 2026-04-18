import { defineCommand } from 'citty'
import { intro, outro, log, select, confirm, isCancel } from '@clack/prompts'
import { simpleGit } from 'simple-git'
import { CONTENTRAIN_BRANCH } from '@contentrain/types'
import { mergeBranch } from '@contentrain/mcp/git/transaction'
import { branchDiff } from '@contentrain/mcp/git/branch-lifecycle'
import { resolveProjectRoot } from '../utils/context.js'
import { pc } from '../utils/ui.js'

export default defineCommand({
  meta: {
    name: 'diff',
    description: 'Review pending contentrain branches',
  },
  args: {
    root: { type: 'string', description: 'Project root path', required: false },
    json: { type: 'boolean', description: 'Emit pending-branches summary as JSON and exit (no interactive review)', required: false },
  },
  async run({ args }) {
    const projectRoot = await resolveProjectRoot(args.root)
    const git = simpleGit(projectRoot)
    const useJson = Boolean(args.json)

    if (!useJson) intro(pc.bold('contentrain diff'))

    // List contentrain branches (filter out the system contentrain branch)
    const branches = await git.branch(['--list', 'cr/*'])
    const featureBranches = branches.all.filter(b => b !== CONTENTRAIN_BRANCH)

    if (useJson) {
      // JSON mode is scriptable: emit branch summaries and exit without
      // entering the interactive review loop. Meant for CI / agent
      // automation that wants to inspect what's pending without a TTY.
      const payload = await Promise.all(featureBranches.map(async (branch) => {
        try {
          const diff = await branchDiff(projectRoot, { branch })
          const insertions = (diff.patch.match(/^\+(?!\+\+)/gmu) ?? []).length
          const deletions = (diff.patch.match(/^-(?!--)/gmu) ?? []).length
          return {
            name: branch,
            base: diff.base,
            filesChanged: diff.filesChanged,
            insertions,
            deletions,
            stat: diff.stat,
          }
        } catch (error) {
          return {
            name: branch,
            base: CONTENTRAIN_BRANCH,
            filesChanged: 0,
            insertions: 0,
            deletions: 0,
            error: error instanceof Error ? error.message : String(error),
          }
        }
      }))
      process.stdout.write(JSON.stringify({ branches: payload }, null, 2))
      return
    }

    if (featureBranches.length === 0) {
      log.message('No pending contentrain branches.')
      outro('')
      return
    }

    log.info(pc.bold(`Pending branches (${featureBranches.length})`))

    // Diff base = CONTENTRAIN_BRANCH (the singleton content-tracking
    // branch every feature branch forks from). Diffing against the
    // repo's default branch (main/master/trunk) surfaces unrelated
    // historical content changes once contentrain has advanced past
    // the default.
    const branchInfos: Array<{ name: string; summary: string; files: number }> = []

    for (const branch of featureBranches) {
      try {
        const diff = await branchDiff(projectRoot, { branch })
        const insertions = (diff.patch.match(/^\+(?!\+\+)/gmu) ?? []).length
        const deletions = (diff.patch.match(/^-(?!--)/gmu) ?? []).length
        branchInfos.push({
          name: branch,
          summary: `${diff.filesChanged} file(s), +${insertions}/-${deletions}`,
          files: diff.filesChanged,
        })
      } catch {
        branchInfos.push({
          name: branch,
          summary: 'Could not diff',
          files: 0,
        })
      }
    }

    for (const info of branchInfos) {
      log.message(`  ${pc.yellow('●')} ${pc.bold(info.name)}  ${pc.dim(info.summary)}`)
    }

    // Interactive review
    const reviewChoice = await select({
      message: 'Select a branch to review',
      options: [
        ...branchInfos.map(b => ({
          value: b.name,
          label: `${b.name} (${b.summary})`,
        })),
        { value: '__skip', label: 'Done — exit' },
      ],
    })

    if (isCancel(reviewChoice) || reviewChoice === '__skip') {
      outro('')
      return
    }

    const selectedBranch = reviewChoice as string

    // Show detailed diff against CONTENTRAIN_BRANCH
    try {
      const detail = await branchDiff(projectRoot, { branch: selectedBranch })
      log.info(pc.bold(`\nDiff: ${selectedBranch} (base: ${detail.base})`))
      log.message(detail.stat)

      if (detail.patch.length < 5000) {
        log.message(detail.patch)
      } else {
        log.message(pc.dim(`(${Math.round(detail.patch.length / 1024)}KB diff — too large to display inline)`))
      }
    } catch (error) {
      log.error(`Could not show diff: ${error instanceof Error ? error.message : String(error)}`)
    }

    // Action
    const action = await select({
      message: 'Action',
      options: [
        { value: 'merge', label: `Merge into ${CONTENTRAIN_BRANCH} + advance base` },
        { value: 'delete', label: 'Delete branch (reject changes)' },
        { value: 'skip', label: 'Leave for later' },
      ],
    })

    if (isCancel(action) || action === 'skip') {
      outro('')
      return
    }

    if (action === 'merge') {
      const confirmMerge = await confirm({ message: `Merge ${selectedBranch} into ${CONTENTRAIN_BRANCH}?` })
      if (!isCancel(confirmMerge) && confirmMerge) {
        // Delegate to MCP's mergeBranch — runs the worktree transaction
        // with selective sync, so dirty developer-tree files are
        // preserved (skipped) rather than overwritten by checkout.
        try {
          const result = await mergeBranch(projectRoot, selectedBranch)
          log.success(`Merged ${selectedBranch} (commit ${result.commit.slice(0, 8)})`)
          if (result.sync?.skipped?.length) {
            log.warning(`${result.sync.skipped.length} file(s) skipped during sync — you have uncommitted changes:`)
            for (const f of result.sync.skipped) {
              log.message(pc.dim(`    ${f}`))
            }
            log.message(pc.dim('  Review your working tree before running another merge.'))
          }
        } catch (error) {
          log.error(`Merge failed: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    } else if (action === 'delete') {
      const confirmDelete = await confirm({ message: `Delete ${selectedBranch}? This cannot be undone.` })
      if (!isCancel(confirmDelete) && confirmDelete) {
        try {
          await git.deleteLocalBranch(selectedBranch, true)
          log.success(`Deleted ${selectedBranch}`)
        } catch (error) {
          log.error(`Delete failed: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    }

    log.message(pc.dim(`\n  Tip: ${pc.cyan('contentrain studio branches')} — visual review and approval in ${pc.bold('Contentrain Studio')} → ${pc.underline('https://studio.contentrain.io')}`))

    outro('')
  },
})
