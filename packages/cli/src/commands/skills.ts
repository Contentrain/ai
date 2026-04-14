import { defineCommand } from 'citty'
import { intro, outro, log, spinner } from '@clack/prompts'
import { join } from 'node:path'
import { resolveProjectRoot } from '../utils/context.js'
import { pc } from '../utils/ui.js'
import { pathExists } from '@contentrain/mcp/util/fs'
import { AGENT_SKILL_NAMES, IDE_CONFIGS, detectIdes, installIdeRulesAndSkills } from '../utils/ide.js'

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
        const result = await installIdeRulesAndSkills(projectRoot, ide, resolveRuleFile, resolveSkillFile, args.update ?? false)
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
