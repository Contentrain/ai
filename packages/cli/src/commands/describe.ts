import { defineCommand } from 'citty'
import { intro, outro, log } from '@clack/prompts'
import { resolveProjectRoot } from '../utils/context.js'
import { openMcpSession } from '../utils/mcp-client.js'
import { pc } from '../utils/ui.js'

/**
 * Read-only inspector for a single model, wrapping `contentrain_describe`.
 *
 * Useful for humans driving the CLI and for agents that want to sanity-
 * check a model's fields, stats, and import snippet without committing
 * anything. `--json` mirrors the MCP tool response verbatim.
 */
export default defineCommand({
  meta: {
    name: 'describe',
    description: 'Show the schema, stats, and import snippet for a model',
  },
  args: {
    model: { type: 'positional', description: 'Model ID (e.g. "blog-post", "hero")', required: true },
    root: { type: 'string', description: 'Project root path', required: false },
    sample: { type: 'boolean', description: 'Include one sample entry', required: false },
    locale: { type: 'string', description: 'Locale for the sample entry', required: false },
    json: { type: 'boolean', description: 'Emit raw JSON for scripts', required: false },
  },
  async run({ args }) {
    const projectRoot = await resolveProjectRoot(args.root)
    const modelId = String(args.model)
    const session = await openMcpSession(projectRoot)

    try {
      const result = await session.call<Record<string, unknown>>('contentrain_describe', {
        model: modelId,
        include_sample: Boolean(args.sample),
        ...(args.locale ? { locale: String(args.locale) } : {}),
      })

      if (args.json) {
        process.stdout.write(JSON.stringify(result, null, 2))
        return
      }

      intro(pc.bold(`contentrain describe: ${modelId}`))

      log.info(pc.bold('Metadata'))
      log.message(`  Name:    ${String(result['name'] ?? '—')}`)
      log.message(`  Kind:    ${pc.cyan(String(result['kind'] ?? '—'))}`)
      log.message(`  Domain:  ${String(result['domain'] ?? '—')}`)
      log.message(`  i18n:    ${result['i18n'] ? pc.green('yes') : pc.dim('no')}`)
      if (result['description']) log.message(`  About:   ${String(result['description'])}`)

      const stats = result['stats'] as { total_entries?: number, locales?: Record<string, number> } | undefined
      if (stats) {
        log.info(pc.bold('\nStats'))
        log.message(`  Total entries: ${stats.total_entries ?? 0}`)
        if (stats.locales) {
          for (const [loc, n] of Object.entries(stats.locales)) {
            log.message(`    ${loc}: ${n}`)
          }
        }
      }

      const fields = result['fields'] as Record<string, unknown> | undefined
      if (fields) {
        log.info(pc.bold('\nFields'))
        for (const [name, spec] of Object.entries(fields)) {
          const s = spec as { type?: string, required?: boolean }
          const req = s.required ? pc.yellow(' *') : ''
          log.message(`  ${pc.bold(name)}${req}  ${pc.dim(s.type ?? '')}`)
        }
      }

      if (result['import_snippet']) {
        log.info(pc.bold('\nImport snippet'))
        log.message(pc.dim(String(result['import_snippet'])))
      }

      const vocab = result['vocabulary_hint'] as { note?: string, terms?: Record<string, unknown> } | undefined
      if (vocab?.terms && Object.keys(vocab.terms).length > 0) {
        log.info(pc.bold('\nVocabulary hint'))
        if (vocab.note) log.message(pc.dim(`  ${vocab.note}`))
        for (const term of Object.keys(vocab.terms)) {
          log.message(`  • ${term}`)
        }
      }

      if (result['sample']) {
        log.info(pc.bold('\nSample entry'))
        log.message(pc.dim(JSON.stringify(result['sample'], null, 2)))
      }

      outro('')
    } catch (error) {
      log.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    } finally {
      await session.close()
    }
  },
})
