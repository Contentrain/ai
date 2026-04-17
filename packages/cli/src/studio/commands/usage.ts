import { defineCommand } from 'citty'
import { intro, outro, log, spinner } from '@clack/prompts'
import { pc, formatTable, formatPercent } from '../../utils/ui.js'
import { resolveStudioClient } from '../client.js'
import { resolveStudioContext } from '../resolve-context.js'
import type { UsageMetric } from '../types.js'

export default defineCommand({
  meta: {
    name: 'usage',
    description: 'Show workspace usage metrics',
  },
  args: {
    workspace: { type: 'string', description: 'Workspace ID', required: false },
    project: { type: 'string', description: 'Project ID (for context resolution)', required: false },
    json: { type: 'boolean', description: 'JSON output', required: false },
  },
  async run({ args }) {
    if (!args.json) {
      intro(pc.bold('contentrain studio usage'))
    }

    try {
      const client = await resolveStudioClient()

      // Resolve at least workspace ID
      const ctx = await resolveStudioContext(client, args)
      if (!ctx) {
        log.warning('No workspace found.')
        outro('')
        return
      }

      const s = args.json ? null : spinner()
      s?.start('Fetching usage metrics...')

      const usage = await client.getWorkspaceUsage(ctx.workspaceId)

      s?.stop('Usage loaded')

      if (args.json) {
        process.stdout.write(JSON.stringify(usage, null, 2))
        return
      }

      const rows: string[][] = [
        metricRow('AI messages', usage.aiMessages),
        metricRow('Form submissions', usage.formSubmissions),
        metricRow('CDN bandwidth', usage.cdnBandwidthGb, 'GB'),
        metricRow('Media storage', usage.mediaStorageGb, 'GB'),
      ]

      log.message(formatTable(['Metric', 'Used', 'Limit', '%'], rows))
    } catch (error) {
      log.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    }

    if (!args.json) {
      outro('')
    }
  },
})

function metricRow(name: string, metric: UsageMetric, unit?: string): string[] {
  const suffix = unit ? ` ${unit}` : ''
  const used = formatNumber(metric.current) + suffix
  const limit = metric.limit < 0 ? 'unlimited' : formatNumber(metric.limit) + suffix
  const pct = metric.limit < 0 ? pc.dim('—') : formatPercent(metric.current, metric.limit)

  return [name, used, limit, pct]
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}
