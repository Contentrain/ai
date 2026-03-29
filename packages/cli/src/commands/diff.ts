import { defineCommand } from 'citty'
import { intro, outro, log, select, confirm, isCancel } from '@clack/prompts'
import { simpleGit } from 'simple-git'
import { readConfig } from '@contentrain/mcp/core/config'
import { CONTENTRAIN_BRANCH } from '@contentrain/types'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { resolveProjectRoot } from '../utils/context.js'
import { pc } from '../utils/ui.js'

export default defineCommand({
  meta: {
    name: 'diff',
    description: 'Review pending contentrain branches',
  },
  args: {
    root: { type: 'string', description: 'Project root path', required: false },
  },
  async run({ args }) {
    const projectRoot = await resolveProjectRoot(args.root)
    const git = simpleGit(projectRoot)

    intro(pc.bold('contentrain diff'))

    // List contentrain branches (filter out the system contentrain branch)
    const branches = await git.branch(['--list', 'cr/*'])
    const featureBranches = branches.all.filter(b => b !== CONTENTRAIN_BRANCH)

    if (featureBranches.length === 0) {
      log.message('No pending contentrain branches.')
      outro('')
      return
    }

    log.info(pc.bold(`Pending branches (${featureBranches.length})`))

    // Get base branch from config, env, or fallback
    const config = await readConfig(projectRoot)
    const baseBranch = config?.repository?.default_branch
      ?? ((await git.raw(['branch', '--show-current'])).trim() || 'main')

    // Show each branch with summary
    const branchInfos: Array<{ name: string; summary: string; files: number }> = []

    for (const branch of featureBranches) {
      try {
        const diffStat = await git.diffSummary([`${baseBranch}...${branch}`])
        branchInfos.push({
          name: branch,
          summary: `${diffStat.changed} file(s), +${diffStat.insertions}/-${diffStat.deletions}`,
          files: diffStat.changed,
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

    // Show detailed diff
    try {
      const diff = await git.diff([`${baseBranch}...${selectedBranch}`, '--stat'])
      log.info(pc.bold(`\nDiff: ${selectedBranch}`))
      log.message(diff)

      // Show the actual content changes
      const fullDiff = await git.diff([`${baseBranch}...${selectedBranch}`])
      if (fullDiff.length < 5000) {
        log.message(fullDiff)
      } else {
        log.message(pc.dim(`(${Math.round(fullDiff.length / 1024)}KB diff — too large to display inline)`))
      }
    } catch (error) {
      log.error(`Could not show diff: ${error instanceof Error ? error.message : String(error)}`)
    }

    // Action
    const action = await select({
      message: 'Action',
      options: [
        { value: 'merge', label: `Merge into ${baseBranch}` },
        { value: 'delete', label: 'Delete branch (reject changes)' },
        { value: 'skip', label: 'Leave for later' },
      ],
    })

    if (isCancel(action) || action === 'skip') {
      outro('')
      return
    }

    if (action === 'merge') {
      const confirmMerge = await confirm({ message: `Merge ${selectedBranch} into ${baseBranch}?` })
      if (!isCancel(confirmMerge) && confirmMerge) {
        const mergePath = join(tmpdir(), `cr-merge-${randomUUID()}`)
        try {
          // Ensure contentrain branch exists
          const localBranches = await git.branchLocal()
          if (!localBranches.all.includes(CONTENTRAIN_BRANCH)) {
            await git.branch([CONTENTRAIN_BRANCH, baseBranch])
          }

          // Create temp worktree on contentrain branch
          await git.raw(['worktree', 'add', mergePath, CONTENTRAIN_BRANCH])
          const mergeGit = simpleGit(mergePath)

          // Sync contentrain with base
          await mergeGit.merge([baseBranch, '--no-edit']).catch(() => {})

          // Merge selected branch into contentrain
          await mergeGit.merge([selectedBranch, '--no-edit'])

          // Get contentrain tip
          const tip = (await mergeGit.raw(['rev-parse', 'HEAD'])).trim()

          // Advance base branch via update-ref
          await git.raw(['update-ref', `refs/heads/${baseBranch}`, tip])

          // Sync .contentrain/ files to developer's tree
          const currentBranch = (await git.raw(['branch', '--show-current'])).trim()
          if (currentBranch === baseBranch) {
            await git.checkout([tip, '--', '.contentrain/'])
          }

          // Delete the merged feature branch
          await git.deleteLocalBranch(selectedBranch, true)

          log.success(`Merged and deleted ${selectedBranch}`)
        } catch (error) {
          log.error(`Merge failed: ${error instanceof Error ? error.message : String(error)}`)
        } finally {
          // Cleanup worktree
          await git.raw(['worktree', 'remove', mergePath, '--force']).catch(() => {})
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

    outro('')
  },
})
