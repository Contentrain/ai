import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { MCP_CONFIGS, IDE_CONFIGS, detectIdes, writeMcpConfig, installIdeRulesAndSkills } from '../../src/utils/ide.js'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cr-ide-test-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('codex agent registration', () => {
  it('is a supported agent with a TOML config path', () => {
    // SUPPORTED_AGENTS in setup.ts is derived from MCP_CONFIGS keys.
    expect(MCP_CONFIGS['codex']).toBe('.codex/config.toml')
    expect(IDE_CONFIGS['codex']?.guardrailsFileName).toBe('AGENTS.md')
  })

  it('marks AGENTS.md as a shared instructions file', () => {
    expect(IDE_CONFIGS['codex']?.sharedInstructionsFile).toBe(true)
    expect(IDE_CONFIGS['copilot']?.sharedInstructionsFile).toBe(true)
    // Dedicated files stay overwritable.
    expect(IDE_CONFIGS['claude-code']?.sharedInstructionsFile).toBeUndefined()
  })
})

describe('detectIdes', () => {
  it('detects codex from .codex/', async () => {
    await mkdir(join(root, '.codex'), { recursive: true })
    expect(await detectIdes(root)).toContain('codex')
  })

  it('does not infer codex from AGENTS.md alone', async () => {
    // Many agents read AGENTS.md; using it as a signal would configure Codex
    // for projects that never use it.
    await writeFile(join(root, 'AGENTS.md'), '# Project\n', 'utf-8')
    expect(await detectIdes(root)).not.toContain('codex')
  })
})

describe('writeMcpConfig for codex', () => {
  it('writes a TOML table when no config exists', async () => {
    const result = await writeMcpConfig(root, 'codex')

    expect(result.written).toBe(true)
    expect(result.path).toBe('.codex/config.toml')
    const written = await readFile(join(root, '.codex/config.toml'), 'utf-8')
    expect(written).toContain('[mcp_servers.contentrain]')
    expect(written).toContain('command = "npx"')
    expect(written).toContain('args = ["contentrain", "serve", "--stdio"]')
    // TOML, not JSON — the JSON writer would have produced an object.
    expect(written.trimStart().startsWith('{')).toBe(false)
  })

  it('appends to an existing config without touching other settings', async () => {
    await mkdir(join(root, '.codex'), { recursive: true })
    const existing = 'model = "gpt-5"\napproval_policy = "on-request"\n'
    await writeFile(join(root, '.codex/config.toml'), existing, 'utf-8')

    const result = await writeMcpConfig(root, 'codex')

    expect(result.written).toBe(true)
    const written = await readFile(join(root, '.codex/config.toml'), 'utf-8')
    expect(written.startsWith(existing)).toBe(true)
    expect(written).toContain('[mcp_servers.contentrain]')
  })

  it('is idempotent when already configured', async () => {
    await writeMcpConfig(root, 'codex')
    const first = await readFile(join(root, '.codex/config.toml'), 'utf-8')

    const second = await writeMcpConfig(root, 'codex')

    expect(second.written).toBe(false)
    expect(second.skipped).toBe('Already configured')
    expect(await readFile(join(root, '.codex/config.toml'), 'utf-8')).toBe(first)
  })

  it('leaves other agents on the JSON writer', async () => {
    await writeMcpConfig(root, 'claude-code')
    const written = await readFile(join(root, '.mcp.json'), 'utf-8')
    expect(JSON.parse(written).mcpServers.contentrain.command).toBe('npx')
  })
})

/**
 * Regression: the append path for shared instruction files was unreachable —
 * it re-checked `pathExists` inside the branch where the file does not exist.
 * A pre-existing AGENTS.md would therefore never receive our block, and any
 * force update would have overwritten the project's own instructions.
 */
describe('shared instruction files are appended, never overwritten', () => {
  async function fakeRules(): Promise<(p: string) => string> {
    const dir = join(root, '__rules', 'essential')
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, 'contentrain-essentials.md'),
      '# Contentrain — Essential Rules\n\nAlways call describe_format first.\n',
      'utf-8',
    )
    return (p: string) => join(root, '__rules', p)
  }

  it('appends to an AGENTS.md the project already had', async () => {
    const original = '# My Project\n\nRun tests before committing.\n'
    await writeFile(join(root, 'AGENTS.md'), original, 'utf-8')

    const res = await installIdeRulesAndSkills(root, IDE_CONFIGS['codex']!, await fakeRules(), null)

    const after = await readFile(join(root, 'AGENTS.md'), 'utf-8')
    expect(after.startsWith(original)).toBe(true)
    expect(after).toContain('# Contentrain — Essential Rules')
    expect(res.installed).toBe(1)
  })

  it('does not append twice, and force update does not overwrite', async () => {
    const original = '# My Project\n\nRun tests before committing.\n'
    await writeFile(join(root, 'AGENTS.md'), original, 'utf-8')
    const resolver = await fakeRules()

    await installIdeRulesAndSkills(root, IDE_CONFIGS['codex']!, resolver, null)
    const afterFirst = await readFile(join(root, 'AGENTS.md'), 'utf-8')
    await installIdeRulesAndSkills(root, IDE_CONFIGS['codex']!, resolver, null, true)
    const afterSecond = await readFile(join(root, 'AGENTS.md'), 'utf-8')

    expect(afterSecond).toBe(afterFirst)
    expect(afterSecond.startsWith(original)).toBe(true)
  })

  it('creates AGENTS.md when the project has none', async () => {
    await installIdeRulesAndSkills(root, IDE_CONFIGS['codex']!, await fakeRules(), null)
    expect(await readFile(join(root, 'AGENTS.md'), 'utf-8')).toContain('# Contentrain — Essential Rules')
  })

  it('still overwrites a dedicated rules file on force update', async () => {
    const dest = join(root, '.claude/rules')
    await mkdir(dest, { recursive: true })
    await writeFile(join(dest, 'contentrain-essentials.md'), 'stale\n', 'utf-8')

    await installIdeRulesAndSkills(root, IDE_CONFIGS['claude-code']!, await fakeRules(), null, true)

    expect(await readFile(join(dest, 'contentrain-essentials.md'), 'utf-8')).toContain('describe_format')
  })
})
