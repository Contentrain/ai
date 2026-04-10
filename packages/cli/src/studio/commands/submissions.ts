import { defineCommand } from 'citty'
import { intro, outro, log, spinner, select, confirm, isCancel } from '@clack/prompts'
import { pc, formatTable, formatCount } from '../../utils/ui.js'
import { resolveStudioClient } from '../client.js'
import { resolveStudioContext } from '../resolve-context.js'

export default defineCommand({
  meta: {
    name: 'submissions',
    description: 'Manage form submissions on Studio',
  },
  args: {
    workspace: { type: 'string', description: 'Workspace ID', required: false },
    project: { type: 'string', description: 'Project ID', required: false },
    form: { type: 'string', description: 'Form model ID', required: false },
    status: { type: 'string', description: 'Filter by status (pending, approved, rejected)', required: false },
    json: { type: 'boolean', description: 'JSON output', required: false },
  },
  async run({ args }) {
    if (!args.json) {
      intro(pc.bold('contentrain studio submissions'))
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

      // Resolve form model ID
      const formId = args.form ?? await resolveFormId(args.json)
      if (!formId) {
        if (!args.json) outro('')
        return
      }

      const s = args.json ? null : spinner()
      s?.start('Fetching submissions...')

      const query: Record<string, string> = {}
      if (args.status) query['status'] = args.status

      const result = await client.listSubmissions(workspaceId, projectId, formId, query)

      s?.stop(`${formatCount(result.data.length, 'submission')}`)

      if (args.json) {
        process.stdout.write(JSON.stringify(result, null, 2))
        return
      }

      if (result.data.length === 0) {
        log.info('No submissions found.')
        outro('')
        return
      }

      // Display submissions
      const rows = result.data.map(sub => {
        const preview = summarizeData(sub.data)
        const statusColor = sub.status === 'approved'
          ? pc.green
          : sub.status === 'rejected'
            ? pc.red
            : sub.status === 'spam'
              ? pc.dim
              : pc.yellow
        return [
          sub.id.slice(0, 8),
          preview,
          statusColor(sub.status),
          timeAgo(sub.submittedAt),
        ]
      })
      log.message(formatTable(['ID', 'Preview', 'Status', 'Submitted'], rows))

      // Action
      const pendingSubs = result.data.filter(sub => sub.status === 'pending')
      if (pendingSubs.length === 0) {
        outro('')
        return
      }

      const action = await select({
        message: `${formatCount(pendingSubs.length, 'pending submission')}. What would you like to do?`,
        options: [
          { value: 'approve', label: 'Approve a submission' },
          { value: 'reject', label: 'Reject a submission' },
          { value: 'cancel', label: pc.dim('Done') },
        ],
      })

      if (isCancel(action) || action === 'cancel') {
        outro('')
        return
      }

      const subChoice = await select({
        message: 'Select submission',
        options: pendingSubs.map(sub => ({
          value: sub.id,
          label: `${sub.id.slice(0, 8)} — ${summarizeData(sub.data)}`,
        })),
      })

      if (isCancel(subChoice)) {
        outro('')
        return
      }

      const targetStatus = action === 'approve' ? 'approved' : 'rejected'

      const confirmed = await confirm({
        message: `${action === 'approve' ? 'Approve' : 'Reject'} submission ${(subChoice as string).slice(0, 8)}?`,
      })

      if (isCancel(confirmed) || !confirmed) {
        outro(pc.dim('Cancelled'))
        return
      }

      const ms = spinner()
      ms.start(`${action === 'approve' ? 'Approving' : 'Rejecting'}...`)

      await client.updateSubmissionStatus(
        workspaceId,
        projectId,
        formId,
        subChoice as string,
        targetStatus as 'approved' | 'rejected',
      )

      ms.stop(`Submission ${targetStatus}`)
      log.success(`Submission ${pc.cyan((subChoice as string).slice(0, 8))} ${targetStatus}.`)
    } catch (error) {
      log.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    }

    if (!args.json) {
      outro('')
    }
  },
})

async function resolveFormId(isJson?: boolean): Promise<string | null> {
  if (isJson) {
    const { log: l } = await import('@clack/prompts')
    l.error('--form is required for JSON output.')
    process.exitCode = 1
    return null
  }
  const { text: textPrompt, isCancel: isCancelled } = await import('@clack/prompts')
  const input = await textPrompt({ message: 'Form model ID' })
  if (isCancelled(input)) return null
  return input as string
}

function summarizeData(data: Record<string, unknown>): string {
  const entries = Object.entries(data).slice(0, 2)
  const parts = entries.map(([k, v]) => {
    const val = typeof v === 'string' ? v : JSON.stringify(v)
    const truncated = val.length > 20 ? val.slice(0, 17) + '...' : val
    return `${k}: ${truncated}`
  })
  return parts.join(', ') || '(empty)'
}

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
