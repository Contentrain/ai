import { defineCommand } from 'citty'
import { intro, outro, log, spinner } from '@clack/prompts'
import { pc, formatTable, formatCount } from '../../utils/ui.js'
import { resolveStudioClient } from '../client.js'
import { resolveStudioContext } from '../resolve-context.js'

export default defineCommand({
  meta: {
    name: 'status',
    description: 'Show project overview from Studio',
  },
  args: {
    workspace: { type: 'string', description: 'Workspace ID', required: false },
    project: { type: 'string', description: 'Project ID', required: false },
    json: { type: 'boolean', description: 'JSON output', required: false },
  },
  async run({ args }) {
    if (!args.json) {
      intro(pc.bold('contentrain studio status'))
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
      s?.start('Fetching project status...')

      const [workspaces, projects, branches] = await Promise.all([
        client.listWorkspaces(),
        client.listProjects(workspaceId),
        client.listBranches(workspaceId, projectId).catch(() => [] as never[]),
      ])

      const workspace = workspaces.find(w => w.id === workspaceId)
      const project = projects.find(p => p.id === projectId)

      // CDN status (best-effort)
      let cdnBuilds
      try {
        cdnBuilds = await client.listCdnBuilds(workspaceId, projectId, { limit: '1' })
      } catch {
        // CDN might not be enabled
      }

      s?.stop('Status loaded')

      if (args.json) {
        process.stdout.write(JSON.stringify({
          workspace: workspace ? { id: workspace.id, name: workspace.name, plan: workspace.plan } : null,
          project: project ? { id: project.id, name: project.name, stack: project.stack } : null,
          branches: { total: branches.length, items: branches },
          cdn: cdnBuilds?.data[0] ? {
            lastBuild: {
              status: cdnBuilds.data[0].status,
              fileCount: cdnBuilds.data[0].fileCount,
              createdAt: cdnBuilds.data[0].createdAt,
            },
          } : null,
        }, null, 2))
        return
      }

      // Display
      log.info(pc.bold('Project'))
      if (project) {
        log.message(`  Name:      ${pc.cyan(project.name)}`)
        log.message(`  Stack:     ${project.stack}`)
        log.message(`  Members:   ${project.memberCount}`)
      }

      if (workspace) {
        log.info(pc.bold('\nWorkspace'))
        log.message(`  Name:      ${pc.cyan(workspace.name)}`)
        log.message(`  Plan:      ${workspace.plan}`)
      }

      // Branches
      if (branches.length > 0) {
        log.info(pc.bold(`\nPending branches (${branches.length})`))
        const rows = branches.slice(0, 10).map(b => [
          b.name,
          `+${b.ahead}`,
          b.author ?? '—',
          timeAgo(b.lastCommitDate),
        ])
        log.message(formatTable(['Branch', 'Ahead', 'Author', 'Updated'], rows))
        if (branches.length > 10) {
          log.message(pc.dim(`  ... and ${formatCount(branches.length - 10, 'more branch', 'more branches')}`))
        }
      } else {
        log.message('\nNo pending branches.')
      }

      // CDN
      const lastBuild = cdnBuilds?.data[0]
      if (lastBuild) {
        log.info(pc.bold('\nCDN'))
        const statusColor = lastBuild.status === 'success' ? pc.green : lastBuild.status === 'failed' ? pc.red : pc.yellow
        log.message(`  Last build: ${statusColor(lastBuild.status)} (${formatCount(lastBuild.fileCount, 'file')}, ${timeAgo(lastBuild.createdAt)})`)
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
