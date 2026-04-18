import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  fixturesDir,
  listConformanceScenarios,
  loadConformanceScenario,
} from '../../src/testing/conformance.js'

/**
 * Smoke test for the `@contentrain/mcp/testing/conformance` subpath
 * export. External packages (Studio, third-party reimplementations)
 * rely on these helpers + the shipped fixtures for byte-parity testing;
 * if anything here breaks, that assertion ecosystem goes with it.
 */

describe('conformance subpath export', () => {
  it('fixturesDir resolves to an existing directory that contains scenarios.json', () => {
    expect(existsSync(fixturesDir)).toBe(true)
    expect(existsSync(join(fixturesDir, 'scenarios.json'))).toBe(true)
  })

  it('listConformanceScenarios returns the shipped scenarios sorted by id', () => {
    const scenarios = listConformanceScenarios()
    expect(scenarios.length).toBeGreaterThan(0)
    const ids = scenarios.map(s => s.id)
    expect(ids).toEqual([...ids].toSorted((a, b) => a.localeCompare(b)))
  })

  it('each scenario has description, operation, input, setupDir, expectedDir that resolve on disk', () => {
    for (const scenario of listConformanceScenarios()) {
      expect(scenario.description).toBeTypeOf('string')
      expect(scenario.description.length).toBeGreaterThan(0)
      expect(scenario.operation).toBeTypeOf('string')
      expect(scenario.input).toBeTypeOf('object')
      expect(existsSync(scenario.setupDir)).toBe(true)
      expect(existsSync(scenario.expectedDir)).toBe(true)
    }
  })

  it('loadConformanceScenario resolves a known id', () => {
    const first = listConformanceScenarios()[0]!
    const byId = loadConformanceScenario(first.id)
    expect(byId.id).toBe(first.id)
    expect(byId.dir).toBe(first.dir)
  })

  it('loadConformanceScenario throws a helpful error for an unknown id', () => {
    expect(() => loadConformanceScenario('does-not-exist')).toThrow(/Unknown conformance scenario/u)
  })
})
