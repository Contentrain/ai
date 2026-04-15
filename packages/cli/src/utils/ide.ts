import { join } from 'node:path'
import { readFile, writeFile, appendFile } from 'node:fs/promises'
import { simpleGit } from 'simple-git'
import { ensureDir, pathExists } from '@contentrain/mcp/util/fs'

// ─── Skill list (single source of truth) ───

export const AGENT_SKILL_NAMES = [
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
export const OLD_RULE_FILES = [
  'contentrain-content-quality.md', 'contentrain-seo-rules.md',
  'contentrain-i18n-quality.md', 'contentrain-accessibility-rules.md',
  'contentrain-security-rules.md', 'contentrain-media-rules.md',
  'contentrain-content-conventions.md', 'contentrain-schema-rules.md',
  'contentrain-mcp-usage.md', 'contentrain-workflow-rules.md',
  'contentrain-normalize-rules.md',
]

// ─── IDE config types & registry ───

export interface IdeConfig {
  name: string
  rulesDir: string
  skillsDir: string
  guardrailsFileName: string
  guardrailsFrontmatter?: string
}

export const IDE_CONFIGS: Record<string, IdeConfig> = {
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

// ─── MCP config registry ───

export const MCP_CONFIGS: Record<string, string> = {
  'claude-code': '.mcp.json',
  cursor: '.cursor/mcp.json',
  windsurf: '.windsurf/mcp.json',
  vscode: '.vscode/mcp.json',
  copilot: '.vscode/mcp.json',
}

const STANDARD_MCP_CONFIG = {
  mcpServers: {
    contentrain: {
      command: 'npx',
      args: ['contentrain', 'serve', '--stdio'],
    },
  },
}

// ─── IDE detection ───

export async function detectIdes(projectRoot: string): Promise<string[]> {
  const ides: string[] = []
  if (await pathExists(join(projectRoot, 'CLAUDE.md')) || await pathExists(join(projectRoot, '.claude'))) ides.push('claude-code')
  if (await pathExists(join(projectRoot, '.cursor'))) ides.push('cursor')
  if (await pathExists(join(projectRoot, '.windsurf'))) ides.push('windsurf')
  if (await pathExists(join(projectRoot, '.github'))) ides.push('copilot')
  return ides
}

// ─── MCP config writing ───

export interface WriteMcpConfigResult {
  written: boolean
  path: string
  skipped?: string
}

export async function writeMcpConfig(projectRoot: string, agent: string): Promise<WriteMcpConfigResult> {
  const relativePath = MCP_CONFIGS[agent]
  if (!relativePath) {
    return { written: false, path: '', skipped: `Unknown agent: "${agent}"` }
  }

  const configPath = join(projectRoot, relativePath)

  // If file exists, check whether contentrain is already configured
  if (await pathExists(configPath)) {
    try {
      const existing = JSON.parse(await readFile(configPath, 'utf-8'))
      if (existing?.mcpServers?.contentrain) {
        return { written: false, path: relativePath, skipped: 'Already configured' }
      }
      // Merge: add contentrain to existing mcpServers
      existing.mcpServers = {
        ...existing.mcpServers,
        ...STANDARD_MCP_CONFIG.mcpServers,
      }
      await ensureDir(join(configPath, '..'))
      await writeFile(configPath, JSON.stringify(existing, null, 2) + '\n', 'utf-8')
      return { written: true, path: relativePath }
    } catch {
      // Can't parse existing — overwrite
    }
  }

  // Write new config
  await ensureDir(join(configPath, '..'))
  await writeFile(configPath, JSON.stringify(STANDARD_MCP_CONFIG, null, 2) + '\n', 'utf-8')
  return { written: true, path: relativePath }
}

// ─── Package resolution ───

/**
 * Create a resolver function for a package's files.
 * Tries multiple strategies to handle npm, pnpm, and workspace layouts.
 */
export async function createPackageResolver(
  packageName: string,
  projectRoot: string,
): Promise<((subpath: string) => string) | null> {
  const { createRequire } = await import('node:module')

  // Strategy 1: resolve from CLI bundle (import.meta.url → real path in pnpm)
  try {
    const req = createRequire(import.meta.url)
    req.resolve(packageName)
    return (p: string) => req.resolve(`${packageName}/${p}`)
  } catch { /* not resolvable from CLI bundle */ }

  // Strategy 2: resolve from project root (covers hoisted deps, workspace setups)
  try {
    const req = createRequire(join(projectRoot, 'package.json'))
    req.resolve(packageName)
    return (p: string) => req.resolve(`${packageName}/${p}`)
  } catch { /* not resolvable from project root */ }

  // Strategy 3: direct node_modules path (last resort)
  const directBase = join(projectRoot, 'node_modules', packageName)
  if (await pathExists(directBase)) {
    return (p: string) => join(directBase, p)
  }

  return null
}

// ─── Rules & skills installation ───

export async function installIdeRulesAndSkills(
  projectRoot: string,
  ide: IdeConfig,
  resolveRuleFile: ((p: string) => string) | null,
  resolveSkillFile: ((p: string) => string) | null,
  forceUpdate = false,
): Promise<{ installed: number; updated: number }> {
  let installed = 0
  let updated = 0

  const rulesDir = join(projectRoot, ide.rulesDir)
  const git = simpleGit(projectRoot)
  const filesToAdd: string[] = []

  // 1. Essential guardrails
  if (resolveRuleFile) {
    await ensureDir(rulesDir)
    const guardrailsDest = join(rulesDir, ide.guardrailsFileName)
    try {
      let content = await readFile(resolveRuleFile('essential/contentrain-essentials.md'), 'utf-8')
      if (ide.guardrailsFrontmatter) content = ide.guardrailsFrontmatter + content

      if (await pathExists(guardrailsDest)) {
        if (forceUpdate) { await writeFile(guardrailsDest, content, 'utf-8'); updated++ }
      } else {
        // Copilot: append to existing copilot-instructions.md
        if (ide.name === 'GitHub Copilot' && await pathExists(guardrailsDest)) {
          const existing = await readFile(guardrailsDest, 'utf-8')
          if (!existing.includes('# Contentrain')) {
            await appendFile(guardrailsDest, `\n\n${content}`)
          }
        } else {
          await writeFile(guardrailsDest, content, 'utf-8')
        }
        installed++
      }
      filesToAdd.push(guardrailsDest)
    } catch { /* essential file unavailable */ }
  }

  // 2. Clean up old rule files
  if (await pathExists(rulesDir)) {
    for (const oldFile of OLD_RULE_FILES) {
      const oldPath = join(rulesDir, oldFile)
      if (await pathExists(oldPath)) {
        const { unlink } = await import('node:fs/promises')
        await unlink(oldPath)
      }
    }
  }

  // 3. Agent Skills
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

  if (filesToAdd.length > 0) {
    try {
      await git.add(filesToAdd)
      await git.commit(`[contentrain] install ${ide.name} rules and skills`)
    } catch { /* files may be gitignored or nothing to commit */ }
  }

  return { installed, updated }
}

export async function addClaudeMdReference(projectRoot: string): Promise<void> {
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
      try { await git.add(claudeMdPath); await git.commit('[contentrain] add CLAUDE.md reference') } catch { /* gitignored or nothing to commit */ }
    }
  } else {
    await writeFile(claudeMdPath, `${reference}\n`, 'utf-8')
    try { await git.add(claudeMdPath); await git.commit('[contentrain] add CLAUDE.md reference') } catch { /* gitignored or nothing to commit */ }
  }
}
