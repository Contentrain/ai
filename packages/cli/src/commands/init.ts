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
    log.message('')
    log.message(pc.dim(`  Tip: ${pc.cyan('contentrain studio connect')} — link this project to ${pc.bold('Contentrain Studio')} for`))
    log.message(pc.dim(`       team review, CDN delivery, and collaboration → ${pc.underline('https://studio.contentrain.io')}`))

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

// Agent Skills to install — each is a directory with SKILL.md + references/
const AGENT_SKILL_NAMES = [
  'contentrain',
  'contentrain-normalize',
  'contentrain-quality',
  'contentrain-sdk',
  'contentrain-content',
  'contentrain-model',
  'contentrain-init',
  'contentrain-bulk',
  'contentrain-validate-fix',
  'contentrain-review',
  'contentrain-translate',
  'contentrain-generate',
  'contentrain-serve',
  'contentrain-diff',
  'contentrain-doctor',
]

// Old granular rule files to clean up during migration
const OLD_RULE_FILES = [
  'contentrain-content-quality.md', 'contentrain-seo-rules.md',
  'contentrain-i18n-quality.md', 'contentrain-accessibility-rules.md',
  'contentrain-security-rules.md', 'contentrain-media-rules.md',
  'contentrain-content-conventions.md', 'contentrain-schema-rules.md',
  'contentrain-mcp-usage.md', 'contentrain-workflow-rules.md',
  'contentrain-normalize-rules.md',
]

interface IdeConfig {
  name: string
  rulesDir: string
  skillsDir: string
  guardrailsFileName: string
  guardrailsFrontmatter?: string
}

const IDE_CONFIGS: Record<string, IdeConfig> = {
  'claude-code': {
    name: 'Claude Code',
    rulesDir: '.claude/rules',
    skillsDir: '.claude/skills',
    guardrailsFileName: 'contentrain-essentials.md',
  },
  cursor: {
    name: 'Cursor',
    rulesDir: '.cursor/rules',
    skillsDir: '.cursor/skills',
    guardrailsFileName: 'contentrain-essentials.mdc',
    guardrailsFrontmatter: '---\ndescription: Contentrain essential content governance rules\nalwaysApply: true\n---\n\n',
  },
  windsurf: {
    name: 'Windsurf',
    rulesDir: '.windsurf/rules',
    skillsDir: '.windsurf/skills',
    guardrailsFileName: 'contentrain-essentials.md',
    guardrailsFrontmatter: '---\ndescription: Contentrain essential content governance rules\ntrigger: always_on\n---\n\n',
  },
  copilot: {
    name: 'GitHub Copilot',
    rulesDir: '.github',
    skillsDir: '.agents/skills',
    guardrailsFileName: 'copilot-instructions.md',
  },
}

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
    const hasCursor = await pathExists(join(projectRoot, '.cursor'))
    const hasWindsurf = await pathExists(join(projectRoot, '.windsurf'))
    const hasCopilot = await pathExists(join(projectRoot, '.github'))
    const noIDEDetected = !hasClaudeCode && !hasCursor && !hasWindsurf && !hasCopilot

    const detectedIdes: string[] = []
    if (hasClaudeCode) detectedIdes.push('claude-code')
    if (hasCursor) detectedIdes.push('cursor')
    if (hasWindsurf) detectedIdes.push('windsurf')
    if (hasCopilot) detectedIdes.push('copilot')

    for (const ideKey of detectedIdes) {
      const ide = IDE_CONFIGS[ideKey]!
      await installIdeRulesAndSkills(projectRoot, ide, resolveRuleFile, resolveSkillFile)
    }

    // Claude Code: also add lightweight CLAUDE.md reference
    if (hasClaudeCode) {
      await addClaudeMdReference(projectRoot)
    }

    // Fallback: no IDE detected — write compact CLAUDE.md with essentials
    if (noIDEDetected) {
      const essentials = await readFile(resolveRuleFile('essential/contentrain-essentials.md'), 'utf-8')
      const dest = join(projectRoot, 'CLAUDE.md')
      await writeFile(dest, essentials, 'utf-8')
      const git = simpleGit(projectRoot)
      await git.add(dest)
      try { await git.commit('[contentrain] install AI rules') } catch { /* nothing to commit */ }
    }
  } catch {
    // rules/skills packages may not be installed — skip silently
  }
}

async function installIdeRulesAndSkills(
  projectRoot: string,
  ide: IdeConfig,
  resolveRuleFile: (p: string) => string,
  resolveSkillFile: ((p: string) => string) | null,
): Promise<void> {
  const rulesDir = join(projectRoot, ide.rulesDir)
  const skillsDir = join(projectRoot, ide.skillsDir)
  const git = simpleGit(projectRoot)
  const filesToAdd: string[] = []

  // 1. Install essential guardrails (single compact file, always-loaded)
  await ensureDir(rulesDir)
  const guardrailsDest = join(rulesDir, ide.guardrailsFileName)
  if (!(await pathExists(guardrailsDest))) {
    try {
      let content = await readFile(resolveRuleFile('essential/contentrain-essentials.md'), 'utf-8')
      if (ide.guardrailsFrontmatter) {
        content = ide.guardrailsFrontmatter + content
      }
      // Copilot: append to existing copilot-instructions.md
      if (ide.name === 'GitHub Copilot' && await pathExists(guardrailsDest)) {
        const existing = await readFile(guardrailsDest, 'utf-8')
        if (!existing.includes('# Contentrain')) {
          await appendFile(guardrailsDest, `\n\n${content}`)
        }
      } else {
        await writeFile(guardrailsDest, content, 'utf-8')
      }
      filesToAdd.push(guardrailsDest)
    } catch { /* essential file unavailable */ }
  }

  // 2. Clean up old granular rule files (migration from previous versions)
  for (const oldFile of OLD_RULE_FILES) {
    const oldPath = join(rulesDir, oldFile)
    if (await pathExists(oldPath)) {
      const { unlink } = await import('node:fs/promises')
      await unlink(oldPath)
    }
  }

  // 3. Install Agent Skills format directories
  if (resolveSkillFile) {
    await ensureDir(skillsDir)
    for (const skillName of AGENT_SKILL_NAMES) {
      const skillDir = join(skillsDir, skillName)
      const skillMd = join(skillDir, 'SKILL.md')
      if (await pathExists(skillMd)) continue
      try {
        // Copy SKILL.md
        const src = resolveSkillFile(`skills/${skillName}/SKILL.md`)
        await ensureDir(skillDir)
        await writeFile(skillMd, await readFile(src, 'utf-8'), 'utf-8')
        filesToAdd.push(skillMd)

        // Copy references/ if they exist
        const { readdirSync } = await import('node:fs')
        try {
          const refsDir = join(resolveSkillFile(`skills/${skillName}/SKILL.md`), '..', 'references')
          const refs = readdirSync(refsDir)
          if (refs.length > 0) {
            const destRefsDir = join(skillDir, 'references')
            await ensureDir(destRefsDir)
            for (const ref of refs) {
              const refSrc = join(refsDir, ref)
              const refDest = join(destRefsDir, ref)
              await writeFile(refDest, await readFile(refSrc, 'utf-8'), 'utf-8')
              filesToAdd.push(refDest)
            }
          }
        } catch { /* no references directory */ }
      } catch { /* skill unavailable */ }
    }
  }

  if (filesToAdd.length > 0) {
    await git.add(filesToAdd)
    try {
      await git.commit(`[contentrain] install ${ide.name} rules and skills`)
    } catch { /* nothing to commit */ }
  }
}

async function addClaudeMdReference(projectRoot: string): Promise<void> {
  const claudeMdPath = join(projectRoot, 'CLAUDE.md')
  const marker = '# Contentrain AI Rules'
  const reference = [
    '# Contentrain AI Rules',
    '',
    'This project uses [Contentrain](https://ai.contentrain.io) for AI-driven content management.',
    '',
    '- **Rules** are in `.claude/rules/contentrain-essentials.md` — auto-loaded each conversation',
    '- **Skills** are in `.claude/skills/` — loaded on demand by the agent',
    '- **Docs:** https://ai.contentrain.io',
  ].join('\n')

  const git = simpleGit(projectRoot)
  if (await pathExists(claudeMdPath)) {
    const existing = await readFile(claudeMdPath, 'utf-8')
    if (!existing.includes(marker)) {
      await appendFile(claudeMdPath, `\n\n${reference}\n`)
      await git.add(claudeMdPath)
      try { await git.commit('[contentrain] add CLAUDE.md reference') } catch { /* nothing to commit */ }
    }
  } else {
    await writeFile(claudeMdPath, `${reference}\n`, 'utf-8')
    await git.add(claudeMdPath)
    try { await git.commit('[contentrain] add CLAUDE.md reference') } catch { /* nothing to commit */ }
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
