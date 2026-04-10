import { defineCommand } from 'citty'
import { intro, outro, log, spinner } from '@clack/prompts'
import { pc } from '../../utils/ui.js'
import { resolveStudioClient } from '../client.js'
import { resolveStudioContext } from '../resolve-context.js'

export default defineCommand({
  meta: {
    name: 'activity',
    description: 'Show recent activity from Studio',
  },
  args: {
    workspace: { type: 'string', description: 'Workspace ID', required: false },
    project: { type: 'string', description: 'Project ID', required: false },
    limit: { type: 'string', description: 'Number of entries (default 20)', required: false },
    json: { type: 'boolean', description: 'JSON output', required: false },
  },
  async run({ args }) {
    if (!args.json) {
      intro(pc.bold('contentrain studio activity'))
    }

    try {
      const client = await resolveStudioClient()
      const ctx = await resolveStudioContext(client, args)
      if (!ctx) {
        log.warning('No workspace or project found.')
        outro('')
        return
      }

      const s = args.json ? null : spinner()
      s?.start('Fetching activity...')

      const result = await client.getActivity(
        ctx.workspaceId,
        ctx.projectId,
        { limit: args.limit ?? '20' },
      )

      s?.stop(`${result.data.length} entries`)

      if (args.json) {
        process.stdout.write(JSON.stringify(result, null, 2))
        return
      }

      if (result.data.length === 0) {
        log.info('No recent activity.')
        outro('')
        return
      }

      for (const entry of result.data) {
        const time = pc.dim(timeAgo(entry.createdAt).padEnd(10))
        const actor = pc.cyan(entry.actor.padEnd(24))
        const action = actionColor(entry.action)
        const details = entry.details ? pc.dim(` ${entry.details}`) : ''

        log.message(`  ${time} ${actor} ${action}${details}`)
      }

      if (result.total > result.data.length) {
        log.message(pc.dim(`\n  Showing ${result.data.length} of ${result.total} entries. Use --limit to see more.`))
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

function actionColor(action: string): string {
  if (action.includes('saved') || action.includes('merged')) return pc.green(action)
  if (action.includes('deleted') || action.includes('rejected')) return pc.red(action)
  if (action.includes('build')) return pc.yellow(action)
  return action
}
