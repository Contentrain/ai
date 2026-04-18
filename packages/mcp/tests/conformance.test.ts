import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { cp, mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { tmpdir } from 'node:os'
import type { ContentEntry } from '../src/core/content-manager.js'
import type { ModelDefinition } from '@contentrain/types'
import { readConfig } from '../src/core/config.js'
import { readModel, writeModel } from '../src/core/model-manager.js'
import { writeContent } from '../src/core/content-manager.js'
import { writeContext } from '../src/core/context.js'

/**
 * Conformance test harness — byte-identical parity for content operations.
 *
 * Each fixture under `fixtures/conformance/` is:
 *   setup/       files seeded into a temp projectRoot before the op runs
 *   scenario.json  { id, description, operation, input, context_tool? }
 *   expected/    byte-identical file tree after the op runs
 *
 * Set `GENERATE_FIXTURES=1` to regenerate `expected/` instead of asserting.
 *
 * The harness calls the current MCP core write path (pre-refactor). In later
 * phases the runner will switch to plan/apply and provider-based execution,
 * but the fixtures (setup + expected) stay identical — only the runner wires
 * differently.
 */

// Fixtures live under `packages/mcp/testing/conformance/` so they can be
// published as `@contentrain/mcp/testing/conformance` for external
// byte-parity testing (Studio, alt-provider harnesses, etc.).
const FIXTURES_DIR = new URL('../testing/conformance/', import.meta.url).pathname
const FIXED_DATE = new Date('2026-01-01T00:00:00.000Z')
const GENERATE_MODE = process.env['GENERATE_FIXTURES'] === '1'

interface Scenario {
  id: string
  description: string
  operation: 'save_content' | 'save_model' | 'delete_content'
  input: Record<string, unknown>
  context_tool?: string
}

interface LoadedScenario extends Scenario {
  dir: string
}

function loadScenariosSync(): LoadedScenario[] {
  const entries = readdirSync(FIXTURES_DIR, { withFileTypes: true })
  const scenarios: LoadedScenario[] = []
  for (const ent of entries) {
    if (!ent.isDirectory()) continue
    if (ent.name.startsWith('_') || ent.name.startsWith('.')) continue
    const scenarioPath = join(FIXTURES_DIR, ent.name, 'scenario.json')
    if (!existsSync(scenarioPath)) continue
    const raw = readFileSync(scenarioPath, 'utf-8')
    const scenario = JSON.parse(raw) as Scenario
    scenarios.push({ ...scenario, dir: join(FIXTURES_DIR, ent.name) })
  }
  return scenarios.toSorted((a, b) => a.id.localeCompare(b.id))
}

async function runOperation(projectRoot: string, scenario: LoadedScenario): Promise<void> {
  const config = await readConfig(projectRoot)
  if (!config) {
    throw new Error(`Conformance: no config.json for scenario ${scenario.id}`)
  }

  switch (scenario.operation) {
    case 'save_content': {
      const input = scenario.input as { model: string, entries: ContentEntry[] }
      const model = await readModel(projectRoot, input.model)
      if (!model) {
        throw new Error(`Conformance: model "${input.model}" not found in setup of ${scenario.id}`)
      }
      const results = await writeContent(projectRoot, model, input.entries, config, null)
      const entryIds = results
        .map(r => r.id ?? r.slug ?? r.locale)
        .filter((v): v is string => Boolean(v))
      await writeContext(projectRoot, {
        tool: scenario.context_tool ?? 'contentrain_content_save',
        model: input.model,
        locale: input.entries[0]?.locale,
        entries: entryIds,
      })
      break
    }
    case 'save_model': {
      const model = scenario.input as unknown as ModelDefinition
      await writeModel(projectRoot, model)
      await writeContext(projectRoot, {
        tool: scenario.context_tool ?? 'contentrain_model_save',
        model: model.id,
      })
      break
    }
    default:
      throw new Error(`Conformance: unsupported operation "${scenario.operation}" in ${scenario.id}`)
  }
}

async function listFilesRecursive(root: string): Promise<string[]> {
  const files: string[] = []
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const ent of entries) {
      const full = join(dir, ent.name)
      if (ent.isDirectory()) {
        await walk(full)
      } else if (ent.isFile()) {
        files.push(relative(root, full))
      }
    }
  }
  await walk(root)
  return files.toSorted()
}

async function assertDirEqual(actualRoot: string, expectedRoot: string, scenarioId: string): Promise<void> {
  const actualFiles = await listFilesRecursive(actualRoot)
  const expectedFiles = await listFilesRecursive(expectedRoot)
  expect(actualFiles, `${scenarioId}: file tree mismatch`).toEqual(expectedFiles)
  for (const file of actualFiles) {
    const actual = await readFile(join(actualRoot, file), 'utf-8')
    const expected = await readFile(join(expectedRoot, file), 'utf-8')
    expect(actual, `${scenarioId}: byte diff in ${file}`).toBe(expected)
  }
}

const scenarios = loadScenariosSync()

describe('conformance', () => {
  beforeAll(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false })
    vi.setSystemTime(FIXED_DATE)
    process.env['CONTENTRAIN_SOURCE'] = 'mcp-local'
  })

  afterAll(() => {
    vi.useRealTimers()
    delete process.env['CONTENTRAIN_SOURCE']
  })

  if (scenarios.length === 0) {
    it.skip('no scenarios found', () => {})
    return
  }

  for (const scenario of scenarios) {
    it(`${scenario.id} — ${scenario.description}`, async () => {
      const tempRoot = await mkdtemp(join(tmpdir(), 'cr-conf-'))
      try {
        const setupDir = join(scenario.dir, 'setup')
        if (existsSync(setupDir)) {
          await cp(setupDir, tempRoot, { recursive: true })
        }

        await runOperation(tempRoot, scenario)

        const expectedDir = join(scenario.dir, 'expected')
        if (GENERATE_MODE) {
          if (existsSync(expectedDir)) {
            await rm(expectedDir, { recursive: true, force: true })
          }
          await cp(tempRoot, expectedDir, { recursive: true })
        } else {
          if (!existsSync(expectedDir)) {
            throw new Error(
              `Conformance: expected/ missing for ${scenario.id}. `
              + `Run: GENERATE_FIXTURES=1 pnpm --filter @contentrain/mcp test -- conformance`,
            )
          }
          await assertDirEqual(tempRoot, expectedDir, scenario.id)
        }
      } finally {
        await rm(tempRoot, { recursive: true, force: true })
      }
    })
  }
})
