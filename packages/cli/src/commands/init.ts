import { defineCommand } from 'citty'
import { intro, outro, log, spinner, select, multiselect, confirm, isCancel } from '@clack/prompts'
import { join } from 'node:path'
import { simpleGit } from 'simple-git'
import { detectStack } from '@contentrain/mcp/util/detect'
import { ensureDir, pathExists, writeJson } from '@contentrain/mcp/util/fs'
import { writeContext } from '@contentrain/mcp/core/context'
import { writeModel } from '@contentrain/mcp/core/model-manager'
import { getTemplate, listTemplates } from '@contentrain/mcp/templates'
import { createTransaction, buildBranchName } from '@contentrain/mcp/git/transaction'
import { scanSummary } from '@contentrain/mcp/core/scanner'
import { resolveProjectRoot, loadProjectContext } from '../utils/context.js'
import { pc } from '../utils/ui.js'
import { writeFile, readFile, appendFile } from 'node:fs/promises'
import type { ContentrainConfig, Vocabulary } from '@contentrain/types'

const COMMON_LOCALES = [
  { value: 'en', label: 'English' },
  { value: 'tr', label: 'Turkish' },
  { value: 'de', label: 'German' },
  { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'it', label: 'Italian' },
  { value: 'nl', label: 'Dutch' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ar', label: 'Arabic' },
  { value: 'ru', label: 'Russian' },
]

export default defineCommand({
  meta: {
    name: 'init',
    description: 'Initialize Contentrain in your project',
  },
  args: {
    root: { type: 'string', description: 'Project root path', required: false },
    yes: { type: 'boolean', description: 'Skip prompts, use defaults', required: false },
  },
  async run({ args }) {
    const projectRoot = await resolveProjectRoot(args.root)

    intro(pc.bold('contentrain init'))

    // Already initialized?
    const ctx = await loadProjectContext(projectRoot)
    if (ctx.initialized) {
      log.warning('Project already initialized.')
      log.message(`Run ${pc.cyan('contentrain status')} to see current state.`)
      outro('')
      return
    }

    // 1. Detect stack
    const s = spinner()
    s.start('Detecting project stack...')
    const detectedStack = await detectStack(projectRoot)
    s.stop(`Detected: ${pc.cyan(detectedStack)}`)

    if (args.yes) {
      await executeInit(projectRoot, {
        stack: detectedStack,
        locales: ['en'],
        domains: ['marketing', 'blog', 'system'],
        workflow: 'auto-merge',
        template: null,
      })
      outro(pc.green('Initialized with defaults!'))
      return
    }

    // 2. Confirm stack
    const stackChoice = await select({
      message: 'Project framework',
      options: [
        { value: detectedStack, label: `${detectedStack} (detected)` },
        ...['nuxt', 'next', 'astro', 'svelte', 'react-vite', 'other']
          .filter(v => v !== detectedStack)
          .map(v => ({ value: v, label: v })),
      ],
      initialValue: detectedStack,
    })
    if (isCancel(stackChoice)) return handleCancel()

    // 3. Locales
    const localeChoices = await multiselect({
      message: 'Supported locales',
      options: COMMON_LOCALES.map(l => ({
        value: l.value,
        label: `${l.label} (${l.value})`,
      })),
      initialValues: ['en'],
      required: true,
    })
    if (isCancel(localeChoices)) return handleCancel()

    // 4. Domains
    const domainChoices = await multiselect({
      message: 'Content domains',
      options: [
        { value: 'marketing', label: 'Marketing — landing pages, CTAs, testimonials' },
        { value: 'blog', label: 'Blog — posts, categories, authors' },
        { value: 'docs', label: 'Docs — documentation, guides, API' },
        { value: 'system', label: 'System — error messages, labels, notifications' },
        { value: 'ecommerce', label: 'E-commerce — products, categories, reviews' },
      ],
      initialValues: ['marketing', 'blog', 'system'],
      required: true,
    })
    if (isCancel(domainChoices)) return handleCancel()

    // 5. Workflow
    const workflowChoice = await select({
      message: 'Content workflow',
      options: [
        { value: 'auto-merge', label: 'Auto-merge — changes apply immediately' },
        { value: 'review', label: 'Review — changes go to branches for review' },
      ],
      initialValue: 'auto-merge',
    })
    if (isCancel(workflowChoice)) return handleCancel()

    // 6. Template
    const templateChoices = listTemplates()
    const templateChoice = await select({
      message: 'Start with a template?',
      options: [
        { value: 'none', label: 'Empty — just the base setup' },
        ...templateChoices.map(t => ({
          value: t,
          label: `${t.charAt(0).toUpperCase() + t.slice(1)} template`,
        })),
      ],
      initialValue: 'none',
    })
    if (isCancel(templateChoice)) return handleCancel()

    // 7. Quick scan preview
    s.start('Scanning project for hardcoded strings...')
    try {
      const summary = await scanSummary(projectRoot)
      s.stop(`Found ~${pc.yellow(String(summary.total_candidates_estimate))} hardcoded strings in ${summary.total_files} files`)
    } catch {
      s.stop('Scan preview skipped (not a recognized project structure)')
    }

    // 8. Confirm
    const proceed = await confirm({ message: 'Initialize Contentrain?' })
    if (isCancel(proceed) || !proceed) return handleCancel()

    // Execute
    await executeInit(projectRoot, {
      stack: stackChoice as string,
      locales: localeChoices as string[],
      domains: domainChoices as string[],
      workflow: workflowChoice as string,
      template: templateChoice === 'none' ? null : templateChoice as string,
    })

    // 9. Post-init suggestions
    log.success('Project initialized!')
    log.info(pc.bold('Next steps:'))
    log.message(`  ${pc.cyan('contentrain status')}     — see your project overview`)
    log.message(`  ${pc.cyan('contentrain doctor')}     — verify setup health`)
    if (templateChoice === 'none') {
      log.message(`  ${pc.cyan('contentrain normalize')} — extract hardcoded strings`)
    }
    log.message(`  ${pc.cyan('contentrain generate')}   — generate SDK client`)

    outro('')
  },
})

interface InitOptions {
  stack: string
  locales: string[]
  domains: string[]
  workflow: string
  template: string | null
}

async function executeInit(projectRoot: string, opts: InitOptions): Promise<void> {
  const s = spinner()
  s.start('Initializing...')

  // Ensure git
  const hasGit = await pathExists(join(projectRoot, '.git'))
  if (!hasGit) {
    await simpleGit(projectRoot).init()
  }

  const branch = buildBranchName('new', 'init')
  const tx = await createTransaction(projectRoot, branch)

  try {
    await tx.write(async (wt) => {
      const wtCrDir = join(wt, '.contentrain')

      // Create directories
      await Promise.all(['models', 'content', 'meta'].map(async (dir) => {
        await ensureDir(join(wtCrDir, dir))
        await writeFile(join(wtCrDir, dir, '.gitkeep'), '', 'utf-8')
      }))

      // Config
      const config: ContentrainConfig = {
        version: 1,
        stack: opts.stack as ContentrainConfig['stack'],
        workflow: opts.workflow as ContentrainConfig['workflow'],
        locales: {
          default: opts.locales[0] ?? 'en',
          supported: opts.locales,
        },
        domains: opts.domains,
      }
      await writeJson(join(wtCrDir, 'config.json'), config)

      // Vocabulary
      const vocabulary: Vocabulary = { version: 1, terms: {} }
      await writeJson(join(wtCrDir, 'vocabulary.json'), vocabulary)

      // Context
      await writeJson(join(wtCrDir, 'context.json'), {
        version: '1',
        lastOperation: {
          tool: 'contentrain_init',
          model: '',
          locale: opts.locales[0] ?? 'en',
          timestamp: new Date().toISOString(),
          source: 'mcp-local',
        },
        stats: { models: 0, entries: 0, locales: opts.locales, lastSync: new Date().toISOString() },
      })

      // Gitignore
      await updateGitignore(wt)

      // Scaffold template if selected
      if (opts.template) {
        const tmpl = getTemplate(opts.template)
        if (tmpl) {
          for (const model of tmpl.models) {
            await writeModel(wt, model)
          }
        }
      }
    })

    await tx.commit(`[contentrain] init: ${opts.stack} project setup`)
    await tx.complete()
    await writeContext(projectRoot, { tool: 'contentrain_init', model: '' })

    s.stop('Initialized')
  } catch (error) {
    s.stop('Failed')
    throw error
  } finally {
    await tx.cleanup()
  }
}

async function updateGitignore(projectRoot: string): Promise<void> {
  const gitignorePath = join(projectRoot, '.gitignore')
  const cacheEntry = '.contentrain/.cache/'

  if (await pathExists(gitignorePath)) {
    const content = await readFile(gitignorePath, 'utf-8')
    if (!content.includes(cacheEntry)) {
      await appendFile(gitignorePath, `\n# Contentrain cache\n${cacheEntry}\n`)
    }
  } else {
    await writeFile(gitignorePath, `# Contentrain cache\n${cacheEntry}\n`, 'utf-8')
  }
}

function handleCancel(): void {
  outro(pc.dim('Cancelled'))
  process.exit(0)
}
