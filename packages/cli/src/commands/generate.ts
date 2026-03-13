import { defineCommand } from 'citty'
import { intro, outro, log, spinner } from '@clack/prompts'
import { resolveProjectRoot, loadProjectContext, requireInitialized } from '../utils/context.js'
import { pc } from '../utils/ui.js'

export default defineCommand({
  meta: {
    name: 'generate',
    description: 'Generate typed SDK client from models',
  },
  args: {
    root: { type: 'string', description: 'Project root path', required: false },
    watch: { type: 'boolean', description: 'Watch for changes and regenerate', required: false },
  },
  async run({ args }) {
    const projectRoot = await resolveProjectRoot(args.root)
    const ctx = await loadProjectContext(projectRoot)
    requireInitialized(ctx)

    intro(pc.bold('contentrain generate'))

    const s = spinner()
    s.start('Generating SDK client...')

    try {
      const { generate } = await import('@contentrain/query/generate')
      const result = await generate({ projectRoot })

      s.stop('SDK client generated')

      log.success(`Output: ${pc.cyan('.contentrain/client/')}`)
      log.message(`  Files:  ${result.generatedFiles.length}`)
      log.message(`  Types:  ${result.typesCount}`)
      log.message(`  Data:   ${result.dataModulesCount} modules`)

      if (result.packageJsonUpdated) {
        log.info(`${pc.cyan('#contentrain')} imports added to package.json`)
      }

      if (args.watch) {
        log.info('Watching for changes... (Ctrl+C to stop)')

        const { watch } = await import('node:fs')
        const { join } = await import('node:path')
        const { contentrainDir } = await import('@contentrain/mcp/util/fs')

        const crDir = contentrainDir(projectRoot)
        const dirsToWatch = [join(crDir, 'models'), join(crDir, 'content')]

        let debounce: ReturnType<typeof setTimeout> | null = null

        for (const dir of dirsToWatch) {
          watch(dir, { recursive: true }, () => {
            if (debounce) clearTimeout(debounce)
            debounce = setTimeout(async () => {
              log.info('Changes detected, regenerating...')
              try {
                const r = await generate({ projectRoot })
                log.success(`Regenerated: ${r.generatedFiles.length} files`)
              } catch (err) {
                log.error(`Regeneration failed: ${err instanceof Error ? err.message : String(err)}`)
              }
            }, 500)
          })
        }

        // Keep process alive
        await new Promise(() => {})
      }
    } catch (error) {
      s.stop('Generation failed')
      log.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    }

    outro('')
  },
})
