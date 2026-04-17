import { defineCommand } from 'citty'
import { intro, outro, log, confirm, isCancel } from '@clack/prompts'
import { simpleGit } from 'simple-git'
import { mergeBranch } from '@contentrain/mcp/git/transaction'
import { CONTENTRAIN_BRANCH } from '@contentrain/types'
import { resolveProjectRoot } from '../utils/context.js'
import { pc } from '../utils/ui.js'

/**
 * One-shot merge of a single contentrain feature branch.
 *
 * `contentrain diff` drives an interactive review over every pending
 * branch; this command is the scriptable, one-branch sibling —
 * shell-friendly for agents, CI, and manual triage. It reuses the exact
 * same MCP helper (`mergeBranch`) that the interactive command
 * delegates to, so the worktree transaction + selective-sync + dirty-
 * file protections stay on one code path.
 */
export default defineCommand({
  meta: {
    name: 'merge',
    description: 'Merge one contentrain feature branch into the content branch',
  },
  args: {
    branch: { type: 'positional', description: 'Feature branch name (e.g. cr/content/blog/...)', required: true },
    root: { type: 'string', description: 'Project root path', required: false },
    yes: { type: 'boolean', description: 'Skip confirmation prompt', required: false },
  },
  async run({ args }) {
    const projectRoot = await resolveProjectRoot(args.root)
    const branch = String(args.branch)

    intro(pc.bold('contentrain merge'))

    if (branch === CONTENTRAIN_BRANCH) {
      log.error(`Cannot merge the content-tracking branch (${CONTENTRAIN_BRANCH}) into itself.`)
      outro('')
      process.exitCode = 1
      return
    }

    const git = simpleGit(projectRoot)
    const localBranches = await git.branchLocal()
    if (!localBranches.all.includes(branch)) {
      log.error(`Branch "${branch}" does not exist locally.`)
      outro('')
      process.exitCode = 1
      return
    }

    if (!args.yes) {
      const ok = await confirm({ message: `Merge ${branch} into ${CONTENTRAIN_BRANCH} and fast-forward the base branch?` })
      if (isCancel(ok) || !ok) {
        outro('')
        return
      }
    }

    try {
      const result = await mergeBranch(projectRoot, branch)
      log.success(`Merged ${branch} (commit ${result.commit.slice(0, 8)})`)
      if (result.sync?.synced?.length) {
        log.message(pc.dim(`  Synced ${result.sync.synced.length} file(s) to working tree.`))
      }
      if (result.sync?.skipped?.length) {
        log.warning(`${result.sync.skipped.length} file(s) skipped during sync — you have uncommitted changes:`)
        for (const f of result.sync.skipped) {
          log.message(pc.dim(`    ${f}`))
        }
        if (result.sync.warning) {
          log.message(pc.dim(`  ${result.sync.warning}`))
        }
      }
    } catch (error) {
      log.error(`Merge failed: ${error instanceof Error ? error.message : String(error)}`)
      process.exitCode = 1
      return
    }

    outro('')
  },
})
