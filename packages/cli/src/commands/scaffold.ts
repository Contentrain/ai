import { defineCommand } from 'citty'
import { intro, outro, log, select, isCancel, spinner } from '@clack/prompts'
import { resolveProjectRoot } from '../utils/context.js'
import { openMcpSession } from '../utils/mcp-client.js'
import { pc } from '../utils/ui.js'

const KNOWN_TEMPLATES = ['blog', 'landing', 'docs', 'ecommerce', 'saas', 'i18n', 'mobile'] as const

/**
 * Template-based project seeding, wrapping `contentrain_scaffold`.
 *
 * Agents normally drive scaffolding through the MCP tool directly; this
 * command gives humans the same entry point with an interactive
 * template picker and a bit more actionable next-step output.
 */
export default defineCommand({
  meta: {
    name: 'scaffold',
    description: 'Apply a Contentrain template (models + sample content + vocabulary)',
  },
  args: {
    root: { type: 'string', description: 'Project root path', required: false },
    template: { type: 'string', description: `Template ID (${KNOWN_TEMPLATES.join(', ')})`, required: false },
    locales: { type: 'string', description: 'Comma-separated locale override (e.g. "en,tr,de")', required: false },
    'no-sample': { type: 'boolean', description: 'Skip sample content', required: false },
    json: { type: 'boolean', description: 'Emit raw JSON for scripts', required: false },
  },
  async run({ args }) {
    const projectRoot = await resolveProjectRoot(args.root)

    let templateId = args.template ? String(args.template) : undefined
    if (!templateId && !args.json) {
      intro(pc.bold('contentrain scaffold'))
      const pick = await select({
        message: 'Choose a template',
        options: KNOWN_TEMPLATES.map(t => ({ value: t, label: t })),
      })
      if (isCancel(pick)) {
        outro('')
        return
      }
      templateId = pick as string
    }

    if (!templateId) {
      log.error('Template is required. Pass --template <id> or run interactively.')
      process.exitCode = 1
      return
    }

    const locales = args.locales
      ? String(args.locales).split(',').map(s => s.trim()).filter(Boolean)
      : undefined

    const session = await openMcpSession(projectRoot)
    const s = args.json ? null : spinner()
    s?.start(`Applying template "${templateId}"...`)

    try {
      const result = await session.call<Record<string, unknown>>('contentrain_scaffold', {
        template: templateId,
        ...(locales ? { locales } : {}),
        with_sample_content: !args['no-sample'],
      })

      s?.stop(`Template "${templateId}" applied.`)

      if (args.json) {
        process.stdout.write(JSON.stringify(result, null, 2))
        return
      }

      const git = result['git'] as { branch?: string, action?: string, commit?: string } | undefined
      log.success(`Scaffolded ${pc.bold(templateId)} on ${pc.cyan(git?.branch ?? '(branch)')} (${git?.action ?? 'committed'})`)
      const models = result['models_created'] as Array<{ id: string }> | undefined
      if (models?.length) {
        log.message(`  Models: ${models.map(m => m.id).join(', ')}`)
      }
      if (typeof result['content_created'] === 'number') {
        log.message(`  Sample entries: ${result['content_created']}`)
      }
      if (typeof result['vocabulary_terms_added'] === 'number' && result['vocabulary_terms_added']) {
        log.message(`  Vocabulary terms added: ${result['vocabulary_terms_added']}`)
      }

      const next = result['next_steps'] as string[] | undefined
      if (next?.length) {
        log.info(pc.bold('\nNext steps'))
        for (const step of next) {
          log.message(`  • ${step}`)
        }
      }

      outro('')
    } catch (error) {
      s?.stop('Scaffold failed.')
      log.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    } finally {
      await session.close()
    }
  },
})
