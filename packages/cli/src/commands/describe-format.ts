import { defineCommand } from 'citty'
import { intro, outro, log } from '@clack/prompts'
import { resolveProjectRoot } from '../utils/context.js'
import { openMcpSession } from '../utils/mcp-client.js'
import { pc } from '../utils/ui.js'

/**
 * Dumps the Contentrain content-format specification (what
 * `contentrain_describe_format` returns). Mostly useful as a
 * copy/paste primer for humans pairing with an agent, or for a quick
 * `--json` handoff into another tool.
 */
export default defineCommand({
  meta: {
    name: 'describe-format',
    description: 'Print the Contentrain content-format specification',
  },
  args: {
    root: { type: 'string', description: 'Project root path', required: false },
    json: { type: 'boolean', description: 'Emit raw JSON for scripts', required: false },
  },
  async run({ args }) {
    const projectRoot = await resolveProjectRoot(args.root)
    const session = await openMcpSession(projectRoot)

    try {
      const result = await session.call<Record<string, unknown>>('contentrain_describe_format', {})

      if (args.json) {
        process.stdout.write(JSON.stringify(result, null, 2))
        return
      }

      intro(pc.bold('contentrain describe-format'))
      log.message(pc.dim(JSON.stringify(result, null, 2)))
      outro('')
    } catch (error) {
      log.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    } finally {
      await session.close()
    }
  },
})
