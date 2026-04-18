import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Conformance fixture loader — published as `@contentrain/mcp/testing/conformance`
 * so external tools (Studio, third-party reimplementations, alt-provider
 * test harnesses) can assert byte-identical output against the same
 * scenarios `@contentrain/mcp` tests itself against.
 *
 * Each scenario directory under `testing/conformance/` is:
 *
 *   scenario.json   — { id, description, operation, input, context_tool? }
 *   setup/          — files seeded into a temp projectRoot before the op
 *   expected/       — byte-identical file tree after the op runs
 *
 * Consumers use the `fixturesDir` export to locate the root and the
 * helpers below to iterate scenarios without hardcoding directory names.
 *
 * The fixtures are published as-is — no transformation, no compilation.
 * They ship next to the package so consumers can read them with
 * `node:fs` without additional dependencies.
 */

export interface ConformanceScenario {
  /** Stable scenario id — e.g. `01-new-collection-entry`. */
  id: string
  /** Short human-readable description pulled from `scenario.json`. */
  description: string
  /** The write operation under test — `save_content`, `save_model`, `delete_content`, …. */
  operation: string
  /** Tool input object — passed into the operation at runtime. */
  input: Record<string, unknown>
  /** Optional MCP tool name recorded in the resulting `context.json`. */
  context_tool?: string
  /** Absolute path to this scenario's directory on disk. */
  dir: string
  /** Absolute path to this scenario's `setup/` tree. */
  setupDir: string
  /** Absolute path to this scenario's `expected/` tree. */
  expectedDir: string
}

const MODULE_DIR = dirname(fileURLToPath(import.meta.url))

/**
 * Resolve the conformance fixtures root. When called from the built
 * package (`dist/testing/conformance.mjs`), the fixtures live at
 * `../../testing/conformance`. When called from source tests
 * (`src/testing/conformance.ts`), they live at
 * `../../testing/conformance` as well — the layout is identical.
 */
export const fixturesDir: string = resolve(MODULE_DIR, '..', '..', 'testing', 'conformance')

/**
 * List every scenario directory under `fixturesDir`. Returns an array
 * sorted by `id` for deterministic iteration.
 */
export function listConformanceScenarios(): ConformanceScenario[] {
  if (!existsSync(fixturesDir)) {
    throw new Error(
      `Conformance fixtures not found at ${fixturesDir}. `
      + 'Is @contentrain/mcp/testing/conformance installed as a dev dependency?',
    )
  }

  const entries = readdirSync(fixturesDir, { withFileTypes: true })
  const scenarios: ConformanceScenario[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue
    const dir = join(fixturesDir, entry.name)
    const scenarioPath = join(dir, 'scenario.json')
    if (!existsSync(scenarioPath)) continue
    scenarios.push({ id: entry.name, ...loadScenarioFile(scenarioPath), dir, setupDir: join(dir, 'setup'), expectedDir: join(dir, 'expected') })
  }
  return scenarios.toSorted((a, b) => a.id.localeCompare(b.id))
}

/**
 * Load a single scenario by id. Throws with a helpful message when the
 * id does not resolve to a published fixture.
 */
export function loadConformanceScenario(id: string): ConformanceScenario {
  const all = listConformanceScenarios()
  const match = all.find(s => s.id === id)
  if (!match) {
    throw new Error(`Unknown conformance scenario "${id}". Known ids: ${all.map(s => s.id).join(', ')}`)
  }
  return match
}

function loadScenarioFile(path: string): Omit<ConformanceScenario, 'id' | 'dir' | 'setupDir' | 'expectedDir'> {
  const raw = readFileSync(path, 'utf-8')
  const parsed = JSON.parse(raw) as {
    description: string
    operation: string
    input: Record<string, unknown>
    context_tool?: string
  }
  return {
    description: parsed.description,
    operation: parsed.operation,
    input: parsed.input,
    ...(parsed.context_tool ? { context_tool: parsed.context_tool } : {}),
  }
}
