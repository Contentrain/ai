import { defineCommand } from 'citty'
import { intro, outro, log, spinner, select, confirm, isCancel } from '@clack/prompts'
import { pc, formatTable, formatCount } from '../../utils/ui.js'
import { resolveStudioClient } from '../client.js'
import { resolveStudioContext } from '../resolve-context.js'
import type { Branch } from '../types.js'

export default defineCommand({
  meta: {
    name: 'branches',
    description: 'Manage content branches on Studio',
  },
  args: {
    workspace: { type: 'string', description: 'Workspace ID', required: false },
    project: { type: 'string', description: 'Project ID', required: false },
    json: { type: 'boolean', description: 'JSON output', required: false },
  },
  async run({ args }) {
    if (!args.json) {
      intro(pc.bold('contentrain studio branches'))
    }

    try {
      const client = await resolveStudioClient()
      const ctx = await resolveStudioContext(client, args)
      if (!ctx) {
        log.warning('No workspace or project found.')
        outro('')
        return
      }

      const { workspaceId, projectId } = ctx

      const s = args.json ? null : spinner()
      s?.start('Fetching branches...')

      const branches = await client.listBranches(workspaceId, projectId)

      s?.stop(`${formatCount(branches.length, 'branch', 'branches')}`)

      if (args.json) {
        process.stdout.write(JSON.stringify(branches, null, 2))
        return
      }

      if (branches.length === 0) {
        log.info('No pending content branches.')
        outro('')
        return
      }

      // Display branches table
      const rows = branches.map((b: Branch) => [
        b.name,
        `+${b.ahead}`,
        b.author ?? '—',
        timeAgo(b.lastCommitDate),
      ])
      log.message(formatTable(['Branch', 'Ahead', 'Author', 'Updated'], rows))

      // Interactive actions
      const branchChoice = await select({
        message: 'Select a branch to manage',
        options: [
          ...branches.map((b: Branch) => ({
            value: b.name,
            label: `${b.name} (+${b.ahead})`,
          })),
          { value: '__cancel__', label: pc.dim('Cancel') },
        ],
      })

      if (isCancel(branchChoice) || branchChoice === '__cancel__') {
        outro('')
        return
      }

      const selectedBranch = branchChoice as string

      const action = await select({
        message: `Action for ${pc.cyan(selectedBranch)}`,
        options: [
          { value: 'merge', label: 'Merge into main branch' },
          { value: 'reject', label: 'Reject and delete' },
          { value: 'cancel', label: pc.dim('Cancel') },
        ],
      })

      if (isCancel(action) || action === 'cancel') {
        outro('')
        return
      }

      if (action === 'merge') {
        const confirmed = await confirm({
          message: `Merge ${pc.cyan(selectedBranch)} into the main branch?`,
        })
        if (isCancel(confirmed) || !confirmed) {
          outro(pc.dim('Cancelled'))
          return
        }

        const ms = spinner()
        ms.start('Merging...')
        await client.mergeBranch(workspaceId, projectId, selectedBranch)
        ms.stop('Merged')
        log.success(`Branch ${pc.cyan(selectedBranch)} merged successfully.`)
      }

      if (action === 'reject') {
        const confirmed = await confirm({
          message: `Reject and delete ${pc.cyan(selectedBranch)}? This cannot be undone.`,
        })
        if (isCancel(confirmed) || !confirmed) {
          outro(pc.dim('Cancelled'))
          return
        }

        const rs = spinner()
        rs.start('Rejecting...')
        await client.rejectBranch(workspaceId, projectId, selectedBranch)
        rs.stop('Rejected')
        log.success(`Branch ${pc.cyan(selectedBranch)} rejected and deleted.`)
      }
    } catch (error) {
      log.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    }

    if (!args.json) {
      outro('')
    }
  },
})

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
