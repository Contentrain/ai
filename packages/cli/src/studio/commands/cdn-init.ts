import { defineCommand } from 'citty'
import { intro, outro, log, spinner, confirm, isCancel } from '@clack/prompts'
import { pc } from '../../utils/ui.js'
import { resolveStudioClient } from '../client.js'
import { resolveStudioContext } from '../resolve-context.js'

export default defineCommand({
  meta: {
    name: 'cdn-init',
    description: 'Set up CDN for content delivery',
  },
  args: {
    workspace: { type: 'string', description: 'Workspace ID', required: false },
    project: { type: 'string', description: 'Project ID', required: false },
  },
  async run({ args }) {
    intro(pc.bold('contentrain studio cdn-init'))

    try {
      const client = await resolveStudioClient()
      const ctx = await resolveStudioContext(client, args)
      if (!ctx) {
        log.warning('No workspace or project found.')
        outro('')
        return
      }

      const { workspaceId, projectId } = ctx

      // Check existing keys
      const s = spinner()
      s.start('Checking CDN status...')

      const existingKeys = await client.listCdnKeys(workspaceId, projectId)

      if (existingKeys.length > 0) {
        s.stop('CDN already configured')
        log.info(`Found ${existingKeys.length} existing CDN key(s):`)
        for (const key of existingKeys) {
          log.message(`  ${pc.cyan(key.name)} — ${pc.dim(key.prefix + '...')} (${key.createdAt})`)
        }

        const createAnother = await confirm({
          message: 'Create an additional CDN key?',
        })
        if (isCancel(createAnother) || !createAnother) {
          outro('')
          return
        }
      } else {
        s.stop('No CDN keys found')
      }

      // Create key
      const s2 = spinner()
      s2.start('Creating CDN API key...')

      const newKey = await client.createCdnKey(workspaceId, projectId, 'cli-generated')

      s2.stop('CDN key created')

      // Show key (once only!)
      log.warning('Save this API key — it will not be shown again:')
      log.message(`\n  ${pc.bold(pc.green(newKey.key ?? newKey.prefix + '...'))}`)
      log.message('')

      // Trigger initial build
      const shouldBuild = await confirm({
        message: 'Trigger initial CDN build now?',
      })

      if (!isCancel(shouldBuild) && shouldBuild) {
        const s3 = spinner()
        s3.start('Building CDN...')

        const build = await client.triggerCdnBuild(workspaceId, projectId)

        if (build.status === 'success') {
          s3.stop(`Build complete (${build.fileCount} files)`)
        } else if (build.status === 'building') {
          s3.stop('Build started (check status with `contentrain studio cdn-build --wait`)')
        } else {
          s3.stop(`Build ${build.status}`)
          if (build.errorMessage) {
            log.warning(build.errorMessage)
          }
        }
      }

      // Show integration snippet
      log.info(pc.bold('\nSDK Integration'))
      log.message(pc.dim('  Install the SDK:'))
      log.message(`  ${pc.cyan('npm install @contentrain/query')}`)
      log.message('')
      log.message(pc.dim('  Configure the CDN client:'))
      log.message(`
  ${pc.dim('import { createContentrainCDN } from \'@contentrain/query/cdn\'')}

  ${pc.dim('const client = createContentrainCDN({')}
  ${pc.dim(`  projectId: '${projectId}',`)}
  ${pc.dim('  apiKey: process.env.CONTENTRAIN_CDN_KEY,')}
  ${pc.dim('})')}
`)
      log.message(pc.dim('  Add to your .env:'))
      log.message(`  ${pc.yellow(`CONTENTRAIN_CDN_KEY=${newKey.key ?? '<your-key>'}`)}`)
    } catch (error) {
      log.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    }

    outro('')
  },
})
