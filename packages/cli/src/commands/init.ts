import { defineCommand } from 'citty'
import { intro, outro, log, spinner, select, multiselect, confirm, isCancel } from '@clack/prompts'
import { join } from 'node:path'
import { simpleGit } from 'simple-git'
import { detectStackInfo } from '@contentrain/mcp/util/detect'
import { ensureDir, pathExists, writeJson } from '@contentrain/mcp/util/fs'
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
    const info = await detectStackInfo(projectRoot)
    s.stop(`Detected: ${pc.cyan(info.name)} — ${info.description}`)

    if (info.monorepo) {
      log.info(`Monorepo: ${pc.green('Yes')}${info.monorepoTool ? ` (${info.monorepoTool})` : ''}`)
    }
    if (info.features.length > 0) {
      log.info(`Features: ${info.features.map(f => pc.dim(f)).join(', ')}`)
    }

    if (args.yes) {
      await executeInit(projectRoot, {
        stack: info.stack,
        locales: ['en'],
        domains: ['marketing', 'blog', 'system'],
        workflow: 'auto-merge',
        template: null,
      })
      outro(pc.green('Initialized with defaults!'))
      return
    }

    // 2. Confirm stack
    const ALL_STACKS = [
      { group: 'Meta-frameworks', items: ['nuxt', 'next', 'astro', 'sveltekit', 'remix', 'analog'] },
      { group: 'Frameworks', items: ['vue', 'react', 'svelte', 'solid', 'angular'] },
      { group: 'Mobile', items: ['react-native', 'expo', 'flutter'] },
      { group: 'Backend', items: ['node', 'express', 'fastify', 'nestjs', 'django', 'rails', 'laravel', 'go', 'rust', 'dotnet'] },
      { group: 'Static', items: ['hugo', 'jekyll', 'eleventy'] },
      { group: 'Desktop', items: ['electron', 'tauri'] },
    ]
    const flatStacks = ALL_STACKS.flatMap(g => g.items)

    const stackChoice = await select({
      message: 'Project framework',
      options: [
        { value: info.stack, label: `${info.name} (detected)` },
        ...flatStacks
          .filter(v => v !== info.stack)
          .map(v => ({ value: v, label: v })),
        { value: 'other', label: 'Other' },
      ],
      initialValue: info.stack,
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
      log.message(`  ${pc.cyan('contentrain serve')}      — open the local review and normalize UI`)
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
    const git = simpleGit(projectRoot)
    await git.init()
    // Create initial commit so branches can be created from it
    await git.add('.')
    await git.commit('initial commit', { '--allow-empty': null })
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

    s.stop('Initialized')

    // Install AI rules for detected IDEs
    await installRules(projectRoot)
  } catch (error) {
    s.stop('Failed')
    throw error
  } finally {
    await tx.cleanup()
  }
}

// Granular rule filenames — order matches shared/ rule files
const RULE_BASE_NAMES = [
  'content-quality',
  'seo-rules',
  'i18n-quality',
  'accessibility-rules',
  'security-rules',
  'media-rules',
  'content-conventions',
  'schema-rules',
  'mcp-usage',
  'workflow-rules',
  'normalize-rules',
]

const SKILL_FILE_NAMES = [
  'contentrain-normalize.md',
  'contentrain-content.md',
  'contentrain-model.md',
  'contentrain-bulk.md',
  'contentrain-validate-fix.md',
  'contentrain-review.md',
  'contentrain-translate.md',
  'contentrain-generate.md',
  'contentrain-serve.md',
  'contentrain-diff.md',
  'contentrain-doctor.md',
  'contentrain-init.md',
]

async function installRules(projectRoot: string): Promise<void> {
  try {
    const { createRequire } = await import('node:module')
    const require = createRequire(import.meta.url)
    const resolveRuleFile = (p: string) => require.resolve(`@contentrain/rules/${p}`)

    let resolveSkillFile: ((p: string) => string) | null = null
    try {
      const requireSkills = createRequire(import.meta.url)
      resolveSkillFile = (p: string) => requireSkills.resolve(`@contentrain/skills/${p}`)
    } catch { /* @contentrain/skills not installed */ }

    // Detect which IDEs are in use
    const hasClaudeCode = await pathExists(join(projectRoot, 'CLAUDE.md')) || await pathExists(join(projectRoot, '.claude'))
    const hasCursorDir = await pathExists(join(projectRoot, '.cursor'))
    const hasCursorRules = await pathExists(join(projectRoot, '.cursorrules'))
    const hasWindsurfDir = await pathExists(join(projectRoot, '.windsurf'))
    const noIDEDetected = !hasClaudeCode && !hasCursorDir && !hasCursorRules && !hasWindsurfDir

    if (hasClaudeCode) {
      await installClaudeCodeRules(projectRoot, resolveRuleFile, resolveSkillFile)
    }

    if (hasCursorDir) {
      await installCursorRules(projectRoot, resolveRuleFile)
    } else if (hasCursorRules) {
      // Legacy .cursorrules — write monolithic bundle
      const source = resolveRuleFile('ide/cursor/contentrain.cursorrules')
      const dest = join(projectRoot, '.cursorrules')
      await writeFile(dest, await readFile(source, 'utf-8'), 'utf-8')
      const git = simpleGit(projectRoot)
      await git.add(dest)
      try { await git.commit('[contentrain] install Cursor rules') } catch { /* nothing to commit */ }
    }

    if (hasWindsurfDir) {
      await installWindsurfRules(projectRoot, resolveRuleFile)
    }

    // Fallback: no IDE detected — write CLAUDE.md with generic rules
    if (noIDEDetected) {
      const source = resolveRuleFile('ide/generic/contentrain.md')
      const dest = join(projectRoot, 'CLAUDE.md')
      await writeFile(dest, await readFile(source, 'utf-8'), 'utf-8')
      const git = simpleGit(projectRoot)
      await git.add(dest)
      try { await git.commit('[contentrain] install AI rules') } catch { /* nothing to commit */ }
    }
  } catch {
    // rules package may not be installed — skip silently
  }
}

async function installClaudeCodeRules(
  projectRoot: string,
  resolveRuleFile: (p: string) => string,
  resolveSkillFile: ((p: string) => string) | null,
): Promise<void> {
  const rulesDir = join(projectRoot, '.claude', 'rules')
  const skillsDir = join(projectRoot, '.claude', 'skills')
  const git = simpleGit(projectRoot)
  const filesToAdd: string[] = []

  // Install granular rule files — one per shared rule
  await ensureDir(rulesDir)
  for (const baseName of RULE_BASE_NAMES) {
    const fileName = `contentrain-${baseName}.md`
    const dest = join(rulesDir, fileName)
    if (await pathExists(dest)) continue
    try {
      const src = resolveRuleFile(`ide/claude-code/rules/${fileName}`)
      await writeFile(dest, await readFile(src, 'utf-8'), 'utf-8')
      filesToAdd.push(dest)
    } catch { /* rule file unavailable in this package version */ }
  }

  // Install workflow skills from @contentrain/skills
  if (resolveSkillFile) {
    await ensureDir(skillsDir)
    for (const fileName of SKILL_FILE_NAMES) {
      const dest = join(skillsDir, fileName)
      if (await pathExists(dest)) continue
      try {
        const src = resolveSkillFile(`workflows/${fileName}`)
        await writeFile(dest, await readFile(src, 'utf-8'), 'utf-8')
        filesToAdd.push(dest)
      } catch { /* skill file unavailable */ }
    }
  }

  // Add lightweight reference to CLAUDE.md instead of full 2984-line bundle
  const claudeMdPath = join(projectRoot, 'CLAUDE.md')
  const marker = '# Contentrain AI Rules'
  const reference = [
    '# Contentrain AI Rules',
    '',
    'This project uses [Contentrain](https://ai.contentrain.io) for AI-driven content management.',
    '',
    '- **Rules** are in `.claude/rules/` — auto-loaded each conversation',
    '- **Skills** are in `.claude/skills/` — invoke with `/contentrain-normalize` etc.',
    '- **Docs:** https://ai.contentrain.io',
  ].join('\n')

  if (await pathExists(claudeMdPath)) {
    const existing = await readFile(claudeMdPath, 'utf-8')
    if (!existing.includes(marker)) {
      await appendFile(claudeMdPath, `\n\n${reference}\n`)
      filesToAdd.push(claudeMdPath)
    }
  } else {
    await writeFile(claudeMdPath, `${reference}\n`, 'utf-8')
    filesToAdd.push(claudeMdPath)
  }

  if (filesToAdd.length > 0) {
    await git.add(filesToAdd)
    try {
      await git.commit('[contentrain] install Claude Code rules and skills')
    } catch { /* nothing to commit */ }
  }
}

async function installCursorRules(
  projectRoot: string,
  resolveRuleFile: (p: string) => string,
): Promise<void> {
  // Cursor modern format: .cursor/rules/*.mdc with alwaysApply frontmatter
  const rulesDir = join(projectRoot, '.cursor', 'rules')
  await ensureDir(rulesDir)
  const git = simpleGit(projectRoot)
  const filesToAdd: string[] = []

  for (const baseName of RULE_BASE_NAMES) {
    const srcFile = `contentrain-${baseName}.mdc`
    const dest = join(rulesDir, srcFile)
    if (await pathExists(dest)) continue
    try {
      const src = resolveRuleFile(`ide/cursor/rules/${srcFile}`)
      await writeFile(dest, await readFile(src, 'utf-8'), 'utf-8')
      filesToAdd.push(dest)
    } catch { /* rule file unavailable */ }
  }

  if (filesToAdd.length > 0) {
    await git.add(filesToAdd)
    try {
      await git.commit('[contentrain] install Cursor rules')
    } catch { /* nothing to commit */ }
  }
}

async function installWindsurfRules(
  projectRoot: string,
  resolveRuleFile: (p: string) => string,
): Promise<void> {
  // Windsurf format: .windsurf/rules/*.md with trigger: always_on frontmatter
  const rulesDir = join(projectRoot, '.windsurf', 'rules')
  await ensureDir(rulesDir)
  const git = simpleGit(projectRoot)
  const filesToAdd: string[] = []

  for (const baseName of RULE_BASE_NAMES) {
    const fileName = `contentrain-${baseName}.md`
    const dest = join(rulesDir, fileName)
    if (await pathExists(dest)) continue
    try {
      const src = resolveRuleFile(`ide/windsurf/rules/${fileName}`)
      await writeFile(dest, await readFile(src, 'utf-8'), 'utf-8')
      filesToAdd.push(dest)
    } catch { /* rule file unavailable */ }
  }

  if (filesToAdd.length > 0) {
    await git.add(filesToAdd)
    try {
      await git.commit('[contentrain] install Windsurf rules')
    } catch { /* nothing to commit */ }
  }
}

async function updateGitignore(projectRoot: string): Promise<void> {
  const gitignorePath = join(projectRoot, '.gitignore')
  const ignoreEntries = ['.contentrain/.cache/', '.contentrain/client/']

  if (await pathExists(gitignorePath)) {
    const content = await readFile(gitignorePath, 'utf-8')
    const missing = ignoreEntries.filter(e => !content.includes(e))
    if (missing.length > 0) {
      await appendFile(gitignorePath, `\n# Contentrain\n${missing.join('\n')}\n`)
    }
  } else {
    await writeFile(gitignorePath, `# Contentrain\n${ignoreEntries.join('\n')}\n`, 'utf-8')
  }
}

function handleCancel(): void {
  outro(pc.dim('Cancelled'))
  process.exit(0)
}
