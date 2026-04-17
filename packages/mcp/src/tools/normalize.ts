import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { FieldDef } from '@contentrain/types'
import { z } from 'zod'
import type { ToolProvider } from '../server.js'
import { readConfig } from '../core/config.js'
import { buildGraph } from '../core/graph-builder.js'
import { scanCandidates, scanSummary } from '../core/scanner.js'
import { applyExtract, applyReuse } from '../core/apply-manager.js'
import { fieldDefZodSchema } from '../core/model-manager.js'
import { TOOL_ANNOTATIONS } from './annotations.js'
import { capabilityError } from './guards.js'

export function registerNormalizeTools(
  server: McpServer,
  _provider: ToolProvider,
  projectRoot: string | undefined,
): void {
  // ─── contentrain_scan ───
  server.tool(
    'contentrain_scan',
    'Scan project source code for content strings. Three modes: "graph" builds import/component graph for project intelligence, "candidates" extracts string literals with pre-filtering and pagination, "summary" provides quick overview stats. Read-only — no changes to disk or git. MCP finds strings deterministically; the agent decides what is content. Recommended workflow: start with "summary" or "graph" for orientation, then paginate through "candidates" to evaluate strings.',
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
    TOOL_ANNOTATIONS['contentrain_scan']!,
    async (input) => {
      if (!projectRoot) return capabilityError('contentrain_scan', 'astScan')
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

  // ─── contentrain_apply ───
  server.tool(
    'contentrain_apply',
    'Apply normalize operations. Two modes: "extract" writes agent-approved strings to Contentrain content files (source untouched), "reuse" patches source files with agent-provided replacement expressions. DRY RUN (default, dry_run:true): validates inputs, resolves conflicts, and returns a full preview — NO changes to disk or git. EXECUTE (dry_run:false): writes files to disk, commits to a branch, and requires branch health check to pass. Recommended workflow: always run dry_run first, review the preview, then call again with dry_run:false to execute. Normalize operations always use review workflow (never auto-merge).',
    {
      mode: z.enum(['extract', 'reuse']).describe('Apply mode: extract (content creation) or reuse (source patching)'),
      dry_run: z.boolean().optional().default(true).describe('Defaults to preview mode (dry_run:true). Set dry_run:false to execute after reviewing the preview.'),

      // Extract mode fields
      extractions: z.array(z.object({
        model: z.string().describe('Model ID (e.g. "ui-texts", "hero-section")'),
        kind: z.enum(['singleton', 'collection', 'dictionary', 'document']).describe('Model kind'),
        domain: z.string().describe('Content domain (e.g. "marketing", "app")'),
        i18n: z.boolean().optional().describe('Enable i18n. Default: true'),
        fields: fieldDefZodSchema.optional().describe('Field definitions — shared schema with model_save for full parity'),
        entries: z.array(z.object({
          locale: z.string().optional().describe('Locale. Default: project default'),
          slug: z.string().optional().describe('Document slug'),
          data: z.record(z.any()).describe('Content data'),
          source: z.object({
            file: z.string().describe('Source file path'),
            line: z.number().describe('Source line number'),
            value: z.string().describe('Original string value'),
          }).optional().describe('Source tracking for traceability'),
          sources: z.array(z.object({
            file: z.string().describe('Source file path'),
            line: z.number().describe('Source line number'),
            key: z.string().describe('Dictionary key this source maps to'),
            value: z.string().describe('Original string value'),
          })).optional().describe('Per-key source tracking for dictionary models'),
        })).describe('Content entries to create'),
      })).optional().describe('Extract mode: content extractions'),

      // Reuse mode fields
      scope: z.object({
        model: z.string().optional().describe('Target model ID'),
        domain: z.string().optional().describe('Target domain'),
      }).optional().describe('Reuse mode: scope (model or domain required)'),
      patches: z.array(z.object({
        file: z.string().describe('Relative file path to patch'),
        line: z.number().describe('Line number hint (±10 line search)'),
        old_value: z.string().describe('Original string to replace'),
        new_expression: z.string().describe('Replacement expression (agent-determined)'),
        import_statement: z.string().optional().describe('Import to add if needed'),
      })).optional().describe('Reuse mode: patches to apply (max 100)'),
    },
    TOOL_ANNOTATIONS['contentrain_apply']!,
    async (input) => {
      if (!projectRoot) {
        const capability = input.mode === 'reuse' ? 'sourceWrite' : 'sourceRead'
        return capabilityError('contentrain_apply', capability)
      }
      const config = await readConfig(projectRoot)
      if (!config) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Project not initialized. Run contentrain_init first.' }) }],
          isError: true,
        }
      }

      try {
        switch (input.mode) {
          case 'extract': {
            if (!input.extractions || input.extractions.length === 0) {
              return {
                content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Extract mode requires extractions array' }) }],
                isError: true,
              }
            }

            const result = await applyExtract(projectRoot, {
              extractions: input.extractions.map(e => ({
                ...e,
                fields: e.fields as Record<string, FieldDef> | undefined,
              })),
              dry_run: input.dry_run,
            })

            // Check for branch-blocked response
            if (result.error !== undefined) {
              return {
                content: [{ type: 'text' as const, text: JSON.stringify({
                  mode: 'extract',
                  ...result,
                }, null, 2) }],
                isError: true,
              }
            }

            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                mode: 'extract',
                ...result,
              }, null, 2) }],
            }
          }

          case 'reuse': {
            if (!input.scope) {
              return {
                content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Reuse mode requires scope (model or domain)' }) }],
                isError: true,
              }
            }
            if (!input.patches || input.patches.length === 0) {
              return {
                content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Reuse mode requires patches array' }) }],
                isError: true,
              }
            }

            const result = await applyReuse(projectRoot, {
              scope: input.scope,
              patches: input.patches,
              dry_run: input.dry_run,
            })

            // Check for branch-blocked response
            if (result.error !== undefined) {
              return {
                content: [{ type: 'text' as const, text: JSON.stringify({
                  mode: 'reuse',
                  ...result,
                }, null, 2) }],
                isError: true,
              }
            }

            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                mode: 'reuse',
                ...result,
              }, null, 2) }],
            }
          }

          default:
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({ error: `Unknown mode: ${input.mode}` }) }],
              isError: true,
            }
        }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            error: `Apply failed: ${error instanceof Error ? error.message : String(error)}`,
          }) }],
          isError: true,
        }
      }
    },
  )
}
