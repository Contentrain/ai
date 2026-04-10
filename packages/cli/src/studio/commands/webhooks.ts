import { defineCommand } from 'citty'
import { intro, outro, log, spinner, select, confirm, isCancel, text, multiselect } from '@clack/prompts'
import { pc, formatTable, statusIcon } from '../../utils/ui.js'
import { resolveStudioClient } from '../client.js'
import { resolveStudioContext } from '../resolve-context.js'
import type { StudioApiClient } from '../client.js'
import type { WebhookEvent } from '../types.js'

const ALL_EVENTS: { value: WebhookEvent; label: string }[] = [
  { value: 'content.saved', label: 'Content saved' },
  { value: 'content.deleted', label: 'Content deleted' },
  { value: 'model.saved', label: 'Model updated' },
  { value: 'branch.merged', label: 'Branch merged' },
  { value: 'branch.rejected', label: 'Branch rejected' },
  { value: 'cdn.build_complete', label: 'CDN build complete' },
  { value: 'media.uploaded', label: 'Media uploaded' },
  { value: 'form.submitted', label: 'Form submitted' },
]

export default defineCommand({
  meta: {
    name: 'webhooks',
    description: 'Manage webhooks on Studio',
  },
  args: {
    workspace: { type: 'string', description: 'Workspace ID', required: false },
    project: { type: 'string', description: 'Project ID', required: false },
    json: { type: 'boolean', description: 'JSON output', required: false },
  },
  async run({ args }) {
    if (!args.json) {
      intro(pc.bold('contentrain studio webhooks'))
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
      s?.start('Fetching webhooks...')

      const webhooks = await client.listWebhooks(workspaceId, projectId)

      s?.stop(`${webhooks.length} webhook(s)`)

      if (args.json) {
        process.stdout.write(JSON.stringify(webhooks, null, 2))
        return
      }

      // Display list
      if (webhooks.length > 0) {
        const rows = webhooks.map(w => [
          w.name,
          w.url.length > 40 ? w.url.slice(0, 37) + '...' : w.url,
          w.events.join(', '),
          statusIcon(w.active),
        ])
        log.message(formatTable(['Name', 'URL', 'Events', 'Active'], rows))
      } else {
        log.info('No webhooks configured.')
      }

      // Action menu
      const action = await select({
        message: 'What would you like to do?',
        options: [
          { value: 'create', label: 'Create new webhook' },
          ...(webhooks.length > 0
            ? [
                { value: 'test', label: 'Test a webhook' },
                { value: 'delete', label: 'Delete a webhook' },
                { value: 'deliveries', label: 'View delivery history' },
              ]
            : []),
          { value: 'cancel', label: pc.dim('Done') },
        ],
      })

      if (isCancel(action) || action === 'cancel') {
        outro('')
        return
      }

      if (action === 'create') {
        await createWebhook(client, workspaceId, projectId)
      } else if (action === 'test') {
        await testWebhook(client, workspaceId, projectId, webhooks)
      } else if (action === 'delete') {
        await deleteWebhook(client, workspaceId, projectId, webhooks)
      } else if (action === 'deliveries') {
        await viewDeliveries(client, workspaceId, projectId, webhooks)
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

async function createWebhook(client: StudioApiClient, wid: string, pid: string): Promise<void> {
  const name = await text({ message: 'Webhook name' })
  if (isCancel(name)) return

  const url = await text({
    message: 'Endpoint URL',
    validate: (v) => {
      if (!v.startsWith('https://')) return 'URL must start with https://'
      return undefined
    },
  })
  if (isCancel(url)) return

  const events = await multiselect({
    message: 'Events to subscribe to',
    options: ALL_EVENTS,
    required: true,
  })
  if (isCancel(events)) return

  const s = spinner()
  s.start('Creating webhook...')

  const webhook = await client.createWebhook(wid, pid, {
    name: name as string,
    url: url as string,
    events: events as WebhookEvent[],
  })

  s.stop('Webhook created')
  log.success(`${pc.cyan(webhook.name)} → ${webhook.url}`)
}

async function testWebhook(
  client: StudioApiClient,
  wid: string,
  pid: string,
  webhooks: { id: string; name: string }[],
): Promise<void> {
  const choice = await select({
    message: 'Select webhook to test',
    options: webhooks.map(w => ({ value: w.id, label: w.name })),
  })
  if (isCancel(choice)) return

  const s = spinner()
  s.start('Sending test event...')

  const result = await client.testWebhook(wid, pid, choice as string)

  s.stop(result.success ? 'Test succeeded' : 'Test failed')

  if (result.httpStatus) {
    log.message(`  HTTP status: ${result.httpStatus}`)
  }
}

async function deleteWebhook(
  client: StudioApiClient,
  wid: string,
  pid: string,
  webhooks: { id: string; name: string }[],
): Promise<void> {
  const choice = await select({
    message: 'Select webhook to delete',
    options: webhooks.map(w => ({ value: w.id, label: w.name })),
  })
  if (isCancel(choice)) return

  const selected = webhooks.find(w => w.id === choice)
  const confirmed = await confirm({
    message: `Delete webhook "${selected?.name}"? This cannot be undone.`,
  })
  if (isCancel(confirmed) || !confirmed) return

  const s = spinner()
  s.start('Deleting...')

  await client.deleteWebhook(wid, pid, choice as string)

  s.stop('Webhook deleted')
}

async function viewDeliveries(
  client: StudioApiClient,
  wid: string,
  pid: string,
  webhooks: { id: string; name: string }[],
): Promise<void> {
  const choice = await select({
    message: 'Select webhook',
    options: webhooks.map(w => ({ value: w.id, label: w.name })),
  })
  if (isCancel(choice)) return

  const s = spinner()
  s.start('Fetching deliveries...')

  const result = await client.listWebhookDeliveries(wid, pid, choice as string)

  s.stop(`${result.data.length} deliveries`)

  if (result.data.length === 0) {
    log.info('No deliveries yet.')
    return
  }

  const rows = result.data.map(d => [
    d.event,
    d.status === 'success' ? pc.green(d.status) : d.status === 'failed' ? pc.red(d.status) : pc.yellow(d.status),
    d.httpStatus ? String(d.httpStatus) : '—',
    timeAgo(d.createdAt),
  ])

  log.message(formatTable(['Event', 'Status', 'HTTP', 'Time'], rows))
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
