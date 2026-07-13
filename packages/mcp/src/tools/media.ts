import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ToolProvider } from '../server.js'
import { TOOL_ANNOTATIONS } from './annotations.js'
import { normalizeOperationError } from '../git/errors.js'

/**
 * Media tools — a deterministic passthrough to the provider's optional
 * media facet (`RepoProvider.media`). Registration is capability-aware:
 * `createServer` skips all five tools when the provider has no media
 * stack, so the guard below is defense in depth only.
 *
 * The facet closes the discovery loop for external agents: list assets →
 * pick a `media/...` path → reference it via `contentrain_content_save`
 * (which normalizes it to an absolute delivery URL when `mediaBaseUrl`
 * is set). Ingest is URL-based — MCP has no binary channel — and the
 * provider implementation owns SSRF/MIME/size policy for the fetch.
 */

function mediaUnavailable(tool: string) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({
      error: `${tool} requires a provider with a media stack.`,
      capability_required: 'media',
      hint: 'Media tools are available when MCP is driven by a media-capable provider (e.g. Studio MCP Cloud). Local and plain git providers do not expose one.',
    }) }],
    isError: true as const,
  }
}

function mediaError(error: unknown, stage: string) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({
      ...normalizeOperationError(error, stage),
    }) }],
    isError: true as const,
  }
}

function ok(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }] }
}

export function registerMediaTools(
  server: McpServer,
  provider: ToolProvider,
  _projectRoot: string | undefined,
): void {
  // ─── contentrain_media_list ───
  server.tool(
    'contentrain_media_list',
    'List media assets from the provider media stack. Returns storage paths (media/...) usable in media/image/file fields via contentrain_content_save, plus delivery URLs when available. Supports search, tag filter, and cursor pagination.',
    {
      search: z.string().optional().describe('Substring match on filename/path/alt'),
      tag: z.string().optional().describe('Only assets carrying this tag'),
      limit: z.number().int().min(1).max(100).optional().describe('Page size. Default: provider-defined'),
      cursor: z.string().optional().describe('Opaque cursor from a previous response'),
    },
    TOOL_ANNOTATIONS['contentrain_media_list']!,
    async (input) => {
      if (!provider.media) return mediaUnavailable('contentrain_media_list')
      try {
        const result = await provider.media.list(input)
        return ok({
          assets: result.assets,
          next_cursor: result.nextCursor,
          total: result.total,
        })
      } catch (error) {
        return mediaError(error, 'media_list')
      }
    },
  )

  // ─── contentrain_media_get ───
  server.tool(
    'contentrain_media_get',
    'Get a single media asset by id, including its storage path, delivery URL, and metadata.',
    {
      id: z.string().describe('Asset id (from contentrain_media_list)'),
    },
    TOOL_ANNOTATIONS['contentrain_media_get']!,
    async (input) => {
      if (!provider.media) return mediaUnavailable('contentrain_media_get')
      try {
        const asset = await provider.media.get(input.id)
        if (!asset) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({
              error: `Media asset not found: ${input.id}`,
              hint: 'Use contentrain_media_list to discover asset ids.',
            }) }],
            isError: true as const,
          }
        }
        return ok({ asset })
      } catch (error) {
        return mediaError(error, 'media_get')
      }
    },
  )

  // ─── contentrain_media_ingest ───
  server.tool(
    'contentrain_media_ingest',
    'Ingest a media asset from a source URL. The provider fetches the URL server-side under its own SSRF/MIME/size policy and stores the asset in the media stack. Returns the stored asset with its media/... path.',
    {
      url: z.string().url().describe('Source URL to fetch server-side'),
      filename: z.string().optional().describe('Target filename override'),
      alt: z.string().optional().describe('Alt text for the asset'),
      tags: z.array(z.string()).max(20).optional().describe('Tags to attach'),
    },
    TOOL_ANNOTATIONS['contentrain_media_ingest']!,
    async (input) => {
      if (!provider.media) return mediaUnavailable('contentrain_media_ingest')
      try {
        const asset = await provider.media.ingest(input)
        return ok({ status: 'ingested', asset })
      } catch (error) {
        return mediaError(error, 'media_ingest')
      }
    },
  )

  // ─── contentrain_media_update ───
  server.tool(
    'contentrain_media_update',
    'Update metadata (alt text, tags, filename) of an existing media asset. Does not touch the binary.',
    {
      id: z.string().describe('Asset id to update'),
      alt: z.string().optional().describe('New alt text'),
      tags: z.array(z.string()).max(20).optional().describe('Replacement tag list'),
      filename: z.string().optional().describe('New filename'),
    },
    TOOL_ANNOTATIONS['contentrain_media_update']!,
    async (input) => {
      if (!provider.media) return mediaUnavailable('contentrain_media_update')
      try {
        const { id, ...patch } = input
        const asset = await provider.media.update(id, patch)
        return ok({ status: 'updated', asset })
      } catch (error) {
        return mediaError(error, 'media_update')
      }
    },
  )

  // ─── contentrain_media_delete ───
  server.tool(
    'contentrain_media_delete',
    'Delete a media asset from the media stack. Content entries referencing its path are NOT rewritten — check references before deleting.',
    {
      id: z.string().describe('Asset id to delete'),
      confirm: z.literal(true).describe('Must be true to confirm deletion'),
    },
    TOOL_ANNOTATIONS['contentrain_media_delete']!,
    async (input) => {
      if (!provider.media) return mediaUnavailable('contentrain_media_delete')
      try {
        await provider.media.delete(input.id)
        return ok({ status: 'deleted', id: input.id })
      } catch (error) {
        return mediaError(error, 'media_delete')
      }
    },
  )
}
