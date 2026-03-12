import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { readConfig } from '../core/config.js'
import { buildGraph } from '../core/graph-builder.js'
import { scanCandidates, scanSummary } from '../core/scanner.js'

export function registerNormalizeTools(server: McpServer, projectRoot: string): void {
  // ─── contentrain_scan ───
  server.tool(
    'contentrain_scan',
    'Scan project source code for content strings. Three modes: "graph" builds import/component graph for project intelligence, "candidates" extracts string literals with pre-filtering and pagination, "summary" provides quick overview stats. Read-only — no git transaction. MCP finds strings deterministically; the agent decides what is content.',
    {
      mode: z.enum(['graph', 'candidates', 'summary']).optional().describe('Scan mode. Default: candidates'),
      paths: z.array(z.string()).optional().describe('Directories to scan (relative to project root). Default: auto-detect'),
      include: z.array(z.string()).optional().describe('File extensions to include. Default: .tsx, .jsx, .vue, .ts, .js, .mjs, .astro, .svelte'),
      exclude: z.array(z.string()).optional().describe('Additional directory names to exclude'),
      limit: z.number().optional().describe('Candidates mode: batch size. Default: 50'),
      offset: z.number().optional().describe('Candidates mode: pagination offset. Default: 0'),
      min_length: z.number().optional().describe('Candidates mode: minimum string length. Default: 2'),
      max_length: z.number().optional().describe('Candidates mode: maximum string length. Default: 500'),
    },
    async (input) => {
      const config = await readConfig(projectRoot)
      if (!config) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Project not initialized. Run contentrain_init first.' }) }],
          isError: true,
        }
      }

      const mode = input.mode ?? 'candidates'

      try {
        switch (mode) {
          case 'graph': {
            const graph = await buildGraph(projectRoot, {
              paths: input.paths,
              include: input.include,
              exclude: input.exclude,
            })

            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                mode: 'graph',
                ...graph,
                next_steps: [
                  'Use mode:candidates to scan specific files/directories for strings',
                  'Focus on pages and components with high string counts first',
                ],
              }, null, 2) }],
            }
          }

          case 'candidates': {
            const result = await scanCandidates(projectRoot, {
              paths: input.paths,
              include: input.include,
              exclude: input.exclude,
              limit: input.limit,
              offset: input.offset,
              min_length: input.min_length,
              max_length: input.max_length,
            })

            const nextSteps: string[] = []
            if (result.stats.has_more) {
              nextSteps.push(`Use offset:${(input.offset ?? 0) + (input.limit ?? 50)} for next batch`)
            }
            nextSteps.push('Evaluate each candidate: is it user-facing content? Which domain/model?')
            if (result.duplicates.length > 0) {
              nextSteps.push('Consider deduplicating repeated strings into shared models')
            }

            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                mode: 'candidates',
                ...result,
                next_steps: nextSteps,
              }, null, 2) }],
            }
          }

          case 'summary': {
            const result = await scanSummary(projectRoot, {
              paths: input.paths,
              include: input.include,
              exclude: input.exclude,
              min_length: input.min_length,
              max_length: input.max_length,
            })

            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                mode: 'summary',
                ...result,
                next_steps: [
                  'Use mode:graph for project structure analysis',
                  'Use mode:candidates to scan directories with most candidates',
                ],
              }, null, 2) }],
            }
          }

          default:
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({ error: `Unknown mode: ${mode}` }) }],
              isError: true,
            }
        }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            error: `Scan failed: ${error instanceof Error ? error.message : String(error)}`,
          }) }],
          isError: true,
        }
      }
    },
  )
}
