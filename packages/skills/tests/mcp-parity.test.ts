import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TOOL_NAMES } from '@contentrain/mcp/tools/annotations'

/**
 * Cross-package parity tests.
 *
 * `@contentrain/skills` ships the canonical MCP tool reference and the
 * workflow / normalize guides that agents load on demand. `@contentrain/mcp`
 * is the runtime authority. Without these tests, drift creeps in: for a
 * while, the reference jumped from `contentrain_submit` straight to
 * `contentrain_bulk` with no `contentrain_merge` section, and normalize
 * SKILL.md taught the legacy `contentrain/normalize/*` branch pattern
 * after MCP switched to `cr/*`.
 *
 * The tests below fail loudly whenever either side moves without the
 * other. Fix by aligning — not by muting the test.
 */

const PKG_ROOT = join(import.meta.dirname, '..')
const TOOL_REF = join(PKG_ROOT, 'skills', 'contentrain', 'references', 'mcp-tools.md')

describe('MCP parity — tool reference coverage', () => {
  it('references/mcp-tools.md has a section for every MCP tool', () => {
    const content = readFileSync(TOOL_REF, 'utf-8')
    const missing: string[] = []
    for (const tool of TOOL_NAMES) {
      const header = new RegExp(`^###\\s+${tool}\\b`, 'mu')
      if (!header.test(content)) missing.push(tool)
    }
    expect(missing, `missing heading "### <tool>" in references/mcp-tools.md for: ${missing.join(', ')}`).toEqual([])
  })
})

describe('MCP parity — branch naming', () => {
  it('skills docs do not reference the legacy `contentrain/<operation>/` branch prefix', () => {
    // The `.contentrain/` directory path is correct — only the branch
    // prefix is stale. Filter accordingly so we don't false-positive on
    // real filesystem paths.
    const filesToScan = [
      'skills/contentrain/references/mcp-pipelines.md',
      'skills/contentrain/references/workflow.md',
      'skills/contentrain/references/mcp-tools.md',
      'skills/contentrain-normalize/SKILL.md',
      'skills/contentrain-normalize/references/extraction.md',
      'skills/contentrain-normalize/references/reuse.md',
      'skills/contentrain-translate/SKILL.md',
    ]
    const legacyPattern = /(^|[^.])contentrain\/(content|model|normalize|new|fix|review)\b/gmu
    const violations: Record<string, string[]> = {}
    for (const rel of filesToScan) {
      const content = readFileSync(join(PKG_ROOT, rel), 'utf-8')
      const matches = [...content.matchAll(legacyPattern)].map(m => m[0].trim())
      if (matches.length > 0) violations[rel] = matches
    }
    expect(violations, `legacy branch prefix found: ${JSON.stringify(violations, null, 2)}`).toEqual({})
  })
})
