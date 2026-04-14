import { defineCommand } from 'citty'
import { intro, outro, log, spinner } from '@clack/prompts'
import { join } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { resolveProjectRoot } from '../utils/context.js'
import { pc } from '../utils/ui.js'
import { ensureDir, pathExists } from '@contentrain/mcp/util/fs'

// ─── Skill and rule definitions ───

const AGENT_SKILL_NAMES = [
  'contentrain', 'contentrain-normalize', 'contentrain-quality',
  'contentrain-sdk', 'contentrain-content', 'contentrain-model',
  'contentrain-init', 'contentrain-bulk', 'contentrain-validate-fix',
  'contentrain-review', 'contentrain-translate', 'contentrain-generate',
  'contentrain-serve', 'contentrain-diff', 'contentrain-doctor',
]

interface IdeConfig {
  name: string
  rulesDir: string
  skillsDir: string
  guardrailsFileName: string
  guardrailsFrontmatter?: string
}

const IDE_CONFIGS: Record<string, IdeConfig> = {
  'claude-code': { name: 'Claude Code', rulesDir: '.claude/rules', skillsDir: '.claude/skills', guardrailsFileName: 'contentrain-essentials.md' },
  cursor: { name: 'Cursor', rulesDir: '.cursor/rules', skillsDir: '.cursor/skills', guardrailsFileName: 'contentrain-essentials.mdc', guardrailsFrontmatter: '---\ndescription: Contentrain essential content governance rules\nalwaysApply: true\n---\n\n' },
  windsurf: { name: 'Windsurf', rulesDir: '.windsurf/rules', skillsDir: '.windsurf/skills', guardrailsFileName: 'contentrain-essentials.md', guardrailsFrontmatter: '---\ndescription: Contentrain essential content governance rules\ntrigger: always_on\n---\n\n' },
  copilot: { name: 'GitHub Copilot', rulesDir: '.github', skillsDir: '.agents/skills', guardrailsFileName: 'copilot-instructions.md' },
}

// ─── Command ───

export default defineCommand({
  meta: {
    name: 'skills',
    description: 'Install, update, or list Contentrain AI skills and rules for your IDE',
  },
  args: {
    root: { type: 'string', description: 'Project root path', required: false },
    update: { type: 'boolean', description: 'Force update all skills and rules', required: false },
    list: { type: 'boolean', description: 'List installed skills and their status', required: false },
  },
  async run({ args }) {
    const projectRoot = await resolveProjectRoot(args.root)

    intro(pc.bold('contentrain skills'))

    if (args.list) {
      await listInstalledSkills(projectRoot)
      return
    }

    const s = spinner()
    s.start('Installing skills and rules...')

    try {
      const { createRequire } = await import('node:module')
      const require = createRequire(import.meta.url)
      const resolveRuleFile = (p: string) => require.resolve(`@contentrain/rules/${p}`)

      let resolveSkillFile: ((p: string) => string) | null = null
      try {
        const requireSkills = createRequire(import.meta.url)
        resolveSkillFile = (p: string) => requireSkills.resolve(`@contentrain/skills/${p}`)
      } catch {
        s.stop('Failed')
        log.error('@contentrain/skills package not found. Install it:')
        log.message(pc.cyan('  pnpm add -D @contentrain/skills @contentrain/rules'))
        outro('')
        return
      }

      // Detect IDEs
      const detectedIdes = await detectIdes(projectRoot)
      if (detectedIdes.length === 0) {
        detectedIdes.push('claude-code') // default
      }

      let totalInstalled = 0
      let totalUpdated = 0

      for (const ideKey of detectedIdes) {
        const ide = IDE_CONFIGS[ideKey]!
        const result = await installForIde(projectRoot, ide, resolveRuleFile, resolveSkillFile, args.update ?? false)
        totalInstalled += result.installed
        totalUpdated += result.updated
      }

      s.stop(`Done — ${detectedIdes.map(k => IDE_CONFIGS[k]!.name).join(', ')}`)

      if (totalUpdated > 0) log.success(`Updated ${totalUpdated} skill(s)`)
      if (totalInstalled > 0) log.success(`Installed ${totalInstalled} new skill(s)`)
      if (totalInstalled === 0 && totalUpdated === 0) log.info('All skills are up to date')

      outro('')
    } catch (error) {
      s.stop('Failed')
      throw error
    }
  },
})

// ─── IDE detection ───

async function detectIdes(projectRoot: string): Promise<string[]> {
  const ides: string[] = []
  if (await pathExists(join(projectRoot, 'CLAUDE.md')) || await pathExists(join(projectRoot, '.claude'))) ides.push('claude-code')
  if (await pathExists(join(projectRoot, '.cursor'))) ides.push('cursor')
  if (await pathExists(join(projectRoot, '.windsurf'))) ides.push('windsurf')
  if (await pathExists(join(projectRoot, '.github'))) ides.push('copilot')
  return ides
}

// ─── Install skills + rules for one IDE ───

async function installForIde(
  projectRoot: string,
  ide: IdeConfig,
  resolveRuleFile: (p: string) => string,
  resolveSkillFile: ((p: string) => string) | null,
  forceUpdate: boolean,
): Promise<{ installed: number; updated: number }> {
  let installed = 0
  let updated = 0

  // Essential guardrails
  const rulesDir = join(projectRoot, ide.rulesDir)
  await ensureDir(rulesDir)
  const guardrailsDest = join(rulesDir, ide.guardrailsFileName)
  try {
    let content = await readFile(resolveRuleFile('essential/contentrain-essentials.md'), 'utf-8')
    if (ide.guardrailsFrontmatter) content = ide.guardrailsFrontmatter + content
    if (await pathExists(guardrailsDest)) {
      if (forceUpdate) { await writeFile(guardrailsDest, content, 'utf-8'); updated++ }
    } else {
      await writeFile(guardrailsDest, content, 'utf-8'); installed++
    }
  } catch { /* essential file unavailable */ }

  // Skills
  if (resolveSkillFile) {
    const skillsDir = join(projectRoot, ide.skillsDir)
    await ensureDir(skillsDir)
    for (const skillName of AGENT_SKILL_NAMES) {
      const skillDir = join(skillsDir, skillName)
      const skillMd = join(skillDir, 'SKILL.md')
      try {
        const src = resolveSkillFile(`skills/${skillName}/SKILL.md`)
        const srcContent = await readFile(src, 'utf-8')
        await ensureDir(skillDir)
        if (await pathExists(skillMd)) {
          if (forceUpdate) { await writeFile(skillMd, srcContent, 'utf-8'); updated++ }
        } else {
          await writeFile(skillMd, srcContent, 'utf-8'); installed++
        }
        // Copy references/
        const { readdirSync } = await import('node:fs')
        try {
          const refsDir = join(src, '..', 'references')
          const refs = readdirSync(refsDir)
          if (refs.length > 0) {
            const destRefsDir = join(skillDir, 'references')
            await ensureDir(destRefsDir)
            for (const ref of refs) {
              const refDest = join(destRefsDir, ref)
              if (forceUpdate || !(await pathExists(refDest))) {
                await writeFile(refDest, await readFile(join(refsDir, ref), 'utf-8'), 'utf-8')
              }
            }
          }
        } catch { /* no references */ }
      } catch { /* skill unavailable */ }
    }
  }

  return { installed, updated }
}

// ─── List installed skills ───

async function listInstalledSkills(projectRoot: string): Promise<void> {
  let found = false

  for (const [, ide] of Object.entries(IDE_CONFIGS)) {
    const skillsDir = join(projectRoot, ide.skillsDir)
    if (!(await pathExists(skillsDir))) continue

    found = true
    log.info(`${pc.bold(ide.name)} (${ide.skillsDir}/):`)

    for (const skillName of AGENT_SKILL_NAMES) {
      const skillMd = join(skillsDir, skillName, 'SKILL.md')
      if (await pathExists(skillMd)) {
        log.message(`  ${pc.green('✓')} ${skillName}`)
      } else {
        log.message(`  ${pc.red('✗')} ${skillName} ${pc.dim('(missing)')}`)
      }
    }

    const guardrailsDest = join(projectRoot, ide.rulesDir, ide.guardrailsFileName)
    if (await pathExists(guardrailsDest)) {
      log.message(`  ${pc.green('✓')} essential rules`)
    } else {
      log.message(`  ${pc.red('✗')} essential rules ${pc.dim('(missing)')}`)
    }
  }

  if (!found) {
    log.warning('No IDE skills directories found. Run `contentrain skills` to install.')
  }

  outro('')
}
