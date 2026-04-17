import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TOOL_NAMES } from '@contentrain/mcp/tools/annotations'
import { buildBranchName } from '@contentrain/mcp/git/transaction'
import { MCP_TOOLS, ESSENTIAL_RULES_FILE } from '../src/index.js'

/**
 * Cross-package parity tests.
 *
 * `@contentrain/rules` publishes a public catalog of tools and branch
 * conventions that agents rely on. `@contentrain/mcp` is the runtime
 * authority. Without this file, the two can (and historically did) drift:
 * the rules catalog sat at 15 tools while MCP advertised 16; the
 * essential rules kept teaching the legacy `contentrain/*` branch
 * namespace after MCP switched to `cr/*`.
 *
 * The tests below fail loudly whenever either side moves without the
 * other. Fix by aligning — not by muting the test.
 */

const PKG_ROOT = join(import.meta.dirname, '..')

describe('MCP parity — tool registry', () => {
  it('MCP_TOOLS matches the MCP annotations registry exactly', () => {
    const rulesSet = new Set(MCP_TOOLS)
    const mcpSet = new Set(TOOL_NAMES)

    const missingFromRules = [...mcpSet].filter(t => !rulesSet.has(t))
    const missingFromMcp = [...rulesSet].filter(t => !mcpSet.has(t))

    expect(missingFromRules, 'tools registered in @contentrain/mcp but missing from @contentrain/rules MCP_TOOLS').toEqual([])
    expect(missingFromMcp, 'tools in @contentrain/rules MCP_TOOLS but not registered in @contentrain/mcp').toEqual([])
    expect(MCP_TOOLS.length).toBe(TOOL_NAMES.length)
  })

  it('essential guardrails document every MCP tool', () => {
    const content = readFileSync(join(PKG_ROOT, ESSENTIAL_RULES_FILE), 'utf-8')
    for (const tool of TOOL_NAMES) {
      expect(content, `essential rules do not mention ${tool}`).toContain(tool)
    }
  })
})

describe('MCP parity — branch naming', () => {
  it('buildBranchName() emits the `cr/` prefix that rules + skills document', () => {
    const samples = [
      buildBranchName('content', 'blog-post', 'en'),
      buildBranchName('model', 'team-member'),
      buildBranchName('normalize/extract', 'marketing'),
      buildBranchName('new', 'scaffold-landing', 'en'),
    ]
    for (const branch of samples) {
      expect(branch, `branch name should start with "cr/": ${branch}`).toMatch(/^cr\//u)
    }
  })

  it('rules docs do not reference the legacy `contentrain/{operation}/` branch prefix', () => {
    // The `.contentrain/` directory path is correct — only the branch
    // prefix is stale. Filter accordingly so the test doesn't
    // false-positive on real filesystem paths.
    const filesToScan = [
      'essential/contentrain-essentials.md',
      'prompts/review-mode.md',
      'prompts/normalize-mode.md',
      'shared/workflow-rules.md',
    ]
    const legacyPattern = /(^|[^.])contentrain\/(content|model|normalize|new|fix|review)\b/gmu
    for (const rel of filesToScan) {
      const content = readFileSync(join(PKG_ROOT, rel), 'utf-8')
      const matches = [...content.matchAll(legacyPattern)]
      expect(matches.length, `legacy "contentrain/<op>/" branch prefix in ${rel}: ${matches.map(m => m[0]).join(', ')}`).toBe(0)
    }
  })
})
