import { defineCommand } from 'citty'
import { intro, outro, log, spinner } from '@clack/prompts'
import { resolveProjectRoot, loadProjectContext } from '../utils/context.js'
import { pc } from '../utils/ui.js'
import { IDE_CONFIGS, MCP_CONFIGS, detectIdes, writeMcpConfig, installIdeRulesAndSkills, createPackageResolver } from '../utils/ide.js'

const SUPPORTED_AGENTS = Object.keys(MCP_CONFIGS)

export default defineCommand({
  meta: {
    name: 'setup',
    description: 'Configure MCP server and AI rules for your IDE',
  },
  args: {
    agent: { type: 'positional', description: `IDE agent: ${SUPPORTED_AGENTS.join(', ')}`, required: false },
    root: { type: 'string', description: 'Project root path', required: false },
    all: { type: 'boolean', description: 'Configure all detected IDEs', required: false },
  },
  async run({ args }) {
    const projectRoot = await resolveProjectRoot(args.root)

    intro(pc.bold('contentrain setup'))

    // Validate agent argument
    const agent = args.agent as string | undefined
    if (!agent && !args.all) {
      log.error('Please specify an agent or use --all:')
      log.message('')
      log.message(`  ${pc.cyan('contentrain setup claude-code')}`)
      log.message(`  ${pc.cyan('contentrain setup cursor')}`)
      log.message(`  ${pc.cyan('contentrain setup vscode')}`)
      log.message(`  ${pc.cyan('contentrain setup windsurf')}`)
      log.message(`  ${pc.cyan('contentrain setup copilot')}`)
      log.message(`  ${pc.cyan('contentrain setup --all')}`)
      outro('')
      return
    }

    if (agent && !SUPPORTED_AGENTS.includes(agent)) {
      log.error(`Unknown agent: "${agent}"`)
      log.message(`Supported agents: ${SUPPORTED_AGENTS.join(', ')}`)
      outro('')
      return
    }

    // Check if project is initialized
    const ctx = await loadProjectContext(projectRoot)
    if (!ctx.initialized) {
      log.warning('Project not initialized. Run `contentrain init` first.')
      outro('')
      return
    }

    const s = spinner()

    // Determine which agents to configure
    let agents: string[]
    if (args.all) {
      agents = await detectIdes(projectRoot)
      if (agents.length === 0) {
        agents = ['claude-code'] // default
      }
      s.start(`Configuring MCP for ${agents.map(a => MCP_CONFIGS[a] ? a : '').filter(Boolean).join(', ')}...`)
    } else {
      agents = [agent!]
      s.start(`Configuring MCP for ${agent}...`)
    }

    const results: Array<{ agent: string; mcp: string; rules: string }> = []

    for (const agentKey of agents) {
      // 1. Write MCP config
      const mcpResult = await writeMcpConfig(projectRoot, agentKey)

      // 2. Install rules & skills if IDE config exists
      let rulesStatus = 'skipped'
      const ideConfig = IDE_CONFIGS[agentKey]
      if (ideConfig) {
        const resolveRuleFile = await createPackageResolver('@contentrain/rules', projectRoot)
        const resolveSkillFile = await createPackageResolver('@contentrain/skills', projectRoot)

        if (!resolveRuleFile && !resolveSkillFile) {
          rulesStatus = 'failed (install @contentrain/rules @contentrain/skills)'
        } else {
          try {
            const result = await installIdeRulesAndSkills(projectRoot, ideConfig, resolveRuleFile, resolveSkillFile)
            const parts: string[] = []
            if (result.installed > 0) parts.push(`${result.installed} installed`)
            if (result.updated > 0) parts.push(`${result.updated} updated`)
            rulesStatus = parts.length > 0 ? parts.join(', ') : 'up to date'
            if (!resolveRuleFile) rulesStatus += ' (rules package not found)'
            if (!resolveSkillFile) rulesStatus += ' (skills package not found)'
          } catch (err) {
            rulesStatus = `failed (${err instanceof Error ? err.message : String(err)})`
          }
        }
      }

      results.push({
        agent: agentKey,
        mcp: mcpResult.written ? `${pc.green('✓')} ${mcpResult.path}` : `${pc.dim('–')} ${mcpResult.skipped ?? mcpResult.path}`,
        rules: rulesStatus,
      })
    }

    s.stop('Done')

    // Display results
    for (const r of results) {
      log.info(`${pc.bold(r.agent)}`)
      log.message(`  MCP config: ${r.mcp}`)
      log.message(`  Rules/skills: ${r.rules}`)
    }

    log.message('')
    log.info(pc.bold('Next steps:'))
    log.message(`  1. Restart your IDE to pick up the MCP config`)
    log.message(`  2. Ask your agent: ${pc.cyan('"Create a hero section model"')}`)
    log.message('')
    log.message(pc.dim(`  Tip: Run ${pc.cyan('contentrain serve')} to open the local review UI`))

    outro('')
  },
})
