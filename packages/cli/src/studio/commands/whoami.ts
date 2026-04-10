import { defineCommand } from 'citty'
import { intro, outro, log } from '@clack/prompts'
import { pc } from '../../utils/ui.js'
import { resolveStudioClient } from '../client.js'
import { checkPermissions } from '../auth/credential-store.js'
import { AuthExpiredError } from '../types.js'

export default defineCommand({
  meta: {
    name: 'whoami',
    description: 'Show current Studio authentication status',
  },
  args: {
    json: { type: 'boolean', description: 'JSON output', required: false },
  },
  async run({ args }) {
    if (!args.json) {
      intro(pc.bold('contentrain studio whoami'))
    }

    try {
      const client = await resolveStudioClient()
      const user = await client.me()

      if (args.json) {
        const workspaces = await client.listWorkspaces()
        process.stdout.write(JSON.stringify({
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            provider: user.provider,
          },
          workspaces: workspaces.map(w => ({
            id: w.id,
            name: w.name,
            slug: w.slug,
            plan: w.plan,
            role: w.role,
          })),
        }, null, 2))
        return
      }

      log.info(pc.bold('Profile'))
      log.message(`  Email:    ${pc.cyan(user.email)}`)
      if (user.name) {
        log.message(`  Name:     ${user.name}`)
      }
      log.message(`  Provider: ${user.provider}`)

      // List workspaces
      const workspaces = await client.listWorkspaces()
      if (workspaces.length > 0) {
        log.info(pc.bold(`\nWorkspaces (${workspaces.length})`))
        for (const ws of workspaces) {
          log.message(`  ${pc.cyan(ws.name)} (${ws.plan}) — ${pc.dim(ws.role)}`)
        }
      }

      // Permission check
      const permWarning = await checkPermissions()
      if (permWarning) {
        log.warning(`\n${permWarning}`)
      }
    } catch (error) {
      if (error instanceof AuthExpiredError) {
        if (args.json) {
          process.stdout.write(JSON.stringify({ error: 'not_authenticated' }))
        } else {
          log.error(error.message)
        }
        process.exitCode = 1
      } else {
        if (!args.json) {
          log.error(error instanceof Error ? error.message : String(error))
        }
        process.exitCode = 1
      }
    }

    if (!args.json) {
      outro('')
    }
  },
})
