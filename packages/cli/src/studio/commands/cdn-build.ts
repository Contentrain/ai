import { defineCommand } from 'citty'
import { intro, outro, log, spinner } from '@clack/prompts'
import { pc, formatCount } from '../../utils/ui.js'
import { resolveStudioClient } from '../client.js'
import { resolveStudioContext } from '../resolve-context.js'

const POLL_INTERVAL_MS = 3_000

export default defineCommand({
  meta: {
    name: 'cdn-build',
    description: 'Trigger a CDN rebuild',
  },
  args: {
    workspace: { type: 'string', description: 'Workspace ID', required: false },
    project: { type: 'string', description: 'Project ID', required: false },
    wait: { type: 'boolean', description: 'Wait for build to complete', required: false },
    json: { type: 'boolean', description: 'JSON output', required: false },
  },
  async run({ args }) {
    if (!args.json) {
      intro(pc.bold('contentrain studio cdn-build'))
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
      s?.start('Triggering CDN build...')

      const build = await client.triggerCdnBuild(workspaceId, projectId)

      if (build.status === 'success') {
        s?.stop('Build complete')
        outputResult(build, args.json)
        if (!args.json) outro('')
        return
      }

      if (!args.wait || build.status === 'failed') {
        s?.stop(`Build ${build.status}`)
        outputResult(build, args.json)
        if (build.status === 'failed' && build.errorMessage && !args.json) {
          log.error(build.errorMessage)
          process.exitCode = 1
        }
        if (!args.json) outro('')
        return
      }

      // Poll until complete
      s?.stop('Build started, waiting...')
      const ps = args.json ? null : spinner()
      ps?.start('Building...')

      let current = build
      while (current.status === 'building') {
        await sleep(POLL_INTERVAL_MS)
        const builds = await client.listCdnBuilds(workspaceId, projectId, { limit: '1' })
        if (builds.data[0]) {
          current = builds.data[0]
        }
      }

      if (current.status === 'success') {
        ps?.stop('Build complete')
        outputResult(current, args.json)
      } else {
        ps?.stop('Build failed')
        outputResult(current, args.json)
        if (current.errorMessage && !args.json) {
          log.error(current.errorMessage)
        }
        process.exitCode = 1
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

function outputResult(
  build: { status: string; fileCount: number; totalSizeBytes: number; buildDurationMs: number | null },
  json?: boolean,
): void {
  if (json) {
    process.stdout.write(JSON.stringify(build, null, 2))
    return
  }

  const sizeKb = (build.totalSizeBytes / 1024).toFixed(1)
  const duration = build.buildDurationMs ? `${(build.buildDurationMs / 1000).toFixed(1)}s` : '—'

  log.message(`  Files:    ${formatCount(build.fileCount, 'file')}`)
  log.message(`  Size:     ${sizeKb} KB`)
  log.message(`  Duration: ${duration}`)

  if (build.status === 'success') {
    log.success('CDN is up to date.')
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
