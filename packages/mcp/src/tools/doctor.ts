import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { ToolProvider } from '../server.js'
import { runDoctor } from '../core/doctor.js'
import { TOOL_ANNOTATIONS } from './annotations.js'
import { capabilityError } from './guards.js'

export function registerDoctorTools(
  server: McpServer,
  _provider: ToolProvider,
  projectRoot: string | undefined,
): void {
  server.tool(
    'contentrain_doctor',
    'Project health report (read-only). Returns structured checks: git, node, .contentrain/ structure, model parse, orphan content, branch pressure, SDK freshness. Pass `usage: true` for a deeper analysis of content-key references in source files (unused keys, duplicate dictionary values, locale coverage). Local-filesystem only — unavailable over remote providers.',
    {
      usage: z.boolean().optional().default(false).describe('Run the heavier usage-analysis branch (unused keys, duplicate values, missing locales). Default: false.'),
    },
    TOOL_ANNOTATIONS['contentrain_doctor']!,
    async ({ usage }) => {
      if (!projectRoot) return capabilityError('contentrain_doctor', 'localWorktree')

      const report = await runDoctor(projectRoot, { usage })
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(report, null, 2) }],
      }
    },
  )
}
