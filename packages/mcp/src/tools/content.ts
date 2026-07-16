import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { ValidationError } from '@contentrain/types'
import type { ToolProvider } from '../server.js'
import { readConfig, readVocabulary } from '../core/config.js'
import { readModel } from '../core/model-manager.js'
import { listContent } from '../core/content-manager.js'
import { planContentDelete, planContentSave } from '../core/ops/index.js'
import type { ContentSaveEntryResult } from '../core/ops/types.js'
import { LocalProvider } from '../providers/local/index.js'
import { buildBranchName } from '../git/transaction.js'
import { checkBranchHealth } from '../git/branch-lifecycle.js'
import { normalizeOperationError } from '../git/errors.js'
import { validateProject } from '../core/validator/index.js'
import { OverlayReader } from '../core/overlay-reader.js'
import { TOOL_ANNOTATIONS } from './annotations.js'
import { commitThroughProvider } from './commit-plan.js'

export function registerContentTools(
  server: McpServer,
  provider: ToolProvider,
  projectRoot: string | undefined,
): void {
  // ─── contentrain_content_save ───
  server.tool(
    'contentrain_content_save',
    'Save content entries. Entry format varies by model kind: DICTIONARY — provide "locale" and "data" (flat key-value, all string values); "id" and "slug" are ignored; data keys are the identities. COLLECTION — provide "locale" and "data"; "id" is optional (auto-generated if omitted); "slug" is ignored. DOCUMENT — provide "slug" (required), "locale", and "data"; use the "body" key inside data for markdown content. SINGLETON — provide only "locale" and "data". MEDIA FIELDS (image/video/file): for a media-library asset, pass its storage path ("media/...") or URL; in cloud mode these are automatically normalized to absolute public delivery URLs on save (in markdown bodies too), so saved content renders in a browser anywhere with no SDK — in local mode the relative path is kept as-is. For external images (e.g. a CDN or Unsplash URL), pass the URL directly; it is saved untouched. Changes are auto-committed to git — do NOT manually edit .contentrain/ files after calling this tool.',
    {
      model: z.string().describe('Model ID'),
      entries: z.array(z.object({
        id: z.string().optional().describe('Entry ID (collection only, auto-generated if omitted)'),
        slug: z.string().optional().describe('Slug (document only)'),
        locale: z.string().optional().describe('Locale code (defaults to config default)'),
        data: z.record(z.string(), z.unknown()).describe('Content data. For documents, include "body" key for markdown content.'),
        publish_at: z.string().optional().describe('ISO 8601 date for scheduled publishing (stored in meta)'),
        expire_at: z.string().optional().describe('ISO 8601 date for scheduled expiry (stored in meta, must be after publish_at)'),
      })).describe('Content entries to save'),
    },
    TOOL_ANNOTATIONS['contentrain_content_save']!,
    async (input) => {
      const config = await readConfig(provider)
      if (!config) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Project not initialized. Run contentrain_init first.' }) }],
          isError: true,
        }
      }

      const model = await readModel(provider, input.model)
      if (!model) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: `Model "${input.model}" not found` }) }],
          isError: true,
        }
      }

      // Validate locales and scheduling fields before starting transaction
      for (const entry of input.entries) {
        if (entry.locale && !config.locales.supported.includes(entry.locale)) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({
              error: `Locale "${entry.locale}" is not supported. Supported: [${config.locales.supported.join(', ')}]`,
            }) }],
            isError: true,
          }
        }

        // Validate publish_at / expire_at
        if (entry.publish_at !== undefined) {
          const d = new Date(entry.publish_at)
          if (Number.isNaN(d.getTime())) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                error: `Invalid publish_at date: "${entry.publish_at}". Must be a valid ISO 8601 date string.`,
              }) }],
              isError: true,
            }
          }
        }
        if (entry.expire_at !== undefined) {
          const d = new Date(entry.expire_at)
          if (Number.isNaN(d.getTime())) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                error: `Invalid expire_at date: "${entry.expire_at}". Must be a valid ISO 8601 date string.`,
              }) }],
              isError: true,
            }
          }
        }
        if (entry.publish_at !== undefined && entry.expire_at !== undefined) {
          if (new Date(entry.expire_at) <= new Date(entry.publish_at)) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                error: `expire_at ("${entry.expire_at}") must be after publish_at ("${entry.publish_at}").`,
              }) }],
              isError: true,
            }
          }
        }

        // Merge scheduling fields into data so meta-manager picks them up
        if (entry.publish_at !== undefined) entry.data['publish_at'] = entry.publish_at
        if (entry.expire_at !== undefined) entry.data['expire_at'] = entry.expire_at
      }

      // Branch health gate — LocalProvider only (git branch count check).
      if (provider instanceof LocalProvider) {
        const health = await checkBranchHealth(provider.projectRoot)
        if (health.blocked) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({
              error: health.message,
              action: 'blocked',
              hint: 'Merge or delete old contentrain/* branches before creating new ones.',
            }, null, 2) }],
            isError: true,
          }
        }
      }

      const vocabulary = await readVocabulary(provider)

      let plan: Awaited<ReturnType<typeof planContentSave>>
      try {
        plan = await planContentSave(provider, {
          model,
          entries: input.entries,
          config,
          vocabulary,
          mediaBaseUrl: provider.mediaBaseUrl,
        })
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            ...normalizeOperationError(error, 'content_save'),
          }) }],
          isError: true,
        }
      }

      const entryIds = plan.result
        .map(r => r.id ?? r.slug ?? r.locale)
        .filter((v): v is string => Boolean(v))

      // Validate BEFORE committing. This used to run after the commit and only
      // report, so an invalid value landed in git — and was auto-merged — while
      // the response still said `status: "committed"` and buried the problem in a
      // next_steps string. The OverlayReader layers the pending changes over the
      // provider, so it needs nothing from the commit.
      const validationResult = await validateProject(
        new OverlayReader(provider, plan.changes),
        { model: input.model },
      )

      // Only this save's own entries are fatal. validateProject checks the whole
      // model, so an unrelated pre-existing error elsewhere in it must not block
      // a caller who is writing something valid — they may not even be able to
      // fix it. Everything else stays in the response as context.
      const blocking = validationResult.issues.filter(
        i => i.severity === 'error' && touchesSavedEntries(i, plan.result),
      )

      if (blocking.length > 0) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            error: 'Validation failed — nothing was written.',
            issues: blocking.map(describeIssue),
            hint: 'Fix the values and call contentrain_content_save again. Nothing was committed, so there is no branch to clean up.',
          }, null, 2) }],
          isError: true,
        }
      }

      const branch = buildBranchName('content', input.model)
      const message = `[contentrain] content: ${input.model}`
      const contextPayload = {
        tool: 'contentrain_content_save',
        model: input.model,
        locale: input.entries[0]?.locale,
        entries: entryIds,
      }

      let commitSha: string
      let workflowAction: 'auto-merged' | 'pending-review'
      let sync: unknown

      try {
        const result = await commitThroughProvider(provider, {
          branch,
          changes: plan.changes,
          message,
          contextPayload,
        })
        commitSha = result.commitSha
        workflowAction = result.workflowAction
        sync = result.sync
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            ...normalizeOperationError(error, 'content_save'),
          }) }],
          isError: true,
        }
      }

      const allAdvisories = plan.result.flatMap(r => r.advisories ?? [])

      // Warnings do not block — they are heuristics (a colour that may not parse,
      // an extension that may contradict `accept`), and a legitimate value can sit
      // outside an approximate pattern. They ride along in the response instead.
      const warnings = validationResult.issues
        .filter(i => i.severity === 'warning' && touchesSavedEntries(i, plan.result))
        .map(i => `${i.field ?? i.locale}: ${i.message}`)

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          status: 'committed',
          message: 'Content saved and committed to git. Do NOT manually edit .contentrain/ files.',
          results: plan.result,
          git: { branch, action: workflowAction, commit: commitSha, ...(sync ? { sync } : {}) },
          ...(allAdvisories.length > 0 ? {
            advisories: allAdvisories,
            advisory_note: 'Save succeeded. Review these warnings and consider consolidating duplicate values.',
          } : {}),
          ...(warnings.length > 0 ? { warnings } : {}),
          validation: { valid: true, errors: [] },
          context_updated: true,
          next_steps: [
            ...(allAdvisories.length > 0 ? ['ADVISORY: Duplicate values detected — review advisories above'] : []),
            ...(warnings.length > 0 ? ['REVIEW: see warnings above — the save was not blocked by them'] : []),
            ...(model.kind === 'collection'
              ? ['Use contentrain_content_list to verify', 'Add more entries or publish']
              : ['Use contentrain_content_list to verify']),
          ],
        }, null, 2) }],
      }
    },
  )

  // ─── contentrain_content_delete ───
  server.tool(
    'contentrain_content_delete',
    'Delete content entries. For dictionaries, use "keys" to remove specific keys (omit to delete entire locale file). Changes are auto-committed to git — do NOT manually edit .contentrain/ files after calling this tool.',
    {
      model: z.string().describe('Model ID'),
      id: z.string().optional().describe('Entry ID (collection)'),
      slug: z.string().optional().describe('Slug (document)'),
      locale: z.string().optional().describe('Locale code'),
      keys: z.array(z.string()).optional().describe('Dictionary only: specific keys to remove. Omit to delete entire locale file.'),
      confirm: z.literal(true).describe('Must be true to confirm deletion'),
    },
    TOOL_ANNOTATIONS['contentrain_content_delete']!,
    async (input) => {
      const config = await readConfig(provider)
      if (!config) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Project not initialized.' }) }],
          isError: true,
        }
      }

      const model = await readModel(provider, input.model)
      if (!model) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: `Model "${input.model}" not found` }) }],
          isError: true,
        }
      }

      if (provider instanceof LocalProvider) {
        const deleteHealth = await checkBranchHealth(provider.projectRoot)
        if (deleteHealth.blocked) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({
              error: deleteHealth.message,
              action: 'blocked',
              hint: 'Merge or delete old contentrain/* branches before creating new ones.',
            }, null, 2) }],
            isError: true,
          }
        }
      }

      let deletePlan: Awaited<ReturnType<typeof planContentDelete>>
      try {
        deletePlan = await planContentDelete(provider, {
          model,
          id: input.id,
          slug: input.slug,
          locale: input.locale,
          keys: input.keys,
          defaultLocale: config.locales.default,
        })
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            ...normalizeOperationError(error, 'content_delete'),
          }) }],
          isError: true,
        }
      }

      const branch = buildBranchName('content', input.model)
      const message = `[contentrain] delete content: ${input.model}`
      const contextPayload = {
        tool: 'contentrain_content_delete',
        model: input.model,
        locale: input.locale,
      }

      let commitSha: string
      let workflowAction: 'auto-merged' | 'pending-review'
      let sync: unknown

      try {
        const result = await commitThroughProvider(provider, {
          branch,
          changes: deletePlan.changes,
          message,
          contextPayload,
        })
        commitSha = result.commitSha
        workflowAction = result.workflowAction
        sync = result.sync

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            status: 'committed',
            message: 'Content deleted and committed to git. Do NOT manually edit .contentrain/ files.',
            deleted: true,
            files_removed: deletePlan.result,
            git: { branch, action: workflowAction, commit: commitSha, ...(sync ? { sync } : {}) },
            context_updated: true,
          }, null, 2) }],
        }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            ...normalizeOperationError(error, 'content_delete'),
          }) }],
          isError: true,
        }
      }
    },
  )

  // ─── contentrain_content_list ───
  server.tool(
    'contentrain_content_list',
    'List content entries (read-only). Returns data from .contentrain/ — do NOT manually create or modify content files.',
    {
      model: z.string().describe('Model ID'),
      locale: z.string().optional().describe('Locale code (defaults to config default)'),
      filter: z.record(z.string(), z.unknown()).optional().describe('Filter criteria (collection only)'),
      resolve: z.boolean().optional().describe('Resolve relation fields to actual data'),
      limit: z.number().optional().describe('Max entries to return'),
      offset: z.number().optional().describe('Skip N entries'),
    },
    TOOL_ANNOTATIONS['contentrain_content_list']!,
    async (input) => {
      const config = await readConfig(provider)
      if (!config) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Project not initialized.' }) }],
          isError: true,
        }
      }

      const model = await readModel(provider, input.model)
      if (!model) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: `Model "${input.model}" not found` }) }],
          isError: true,
        }
      }

      try {
        // LocalProvider path keeps the legacy filesystem implementation
        // (with full `resolve:true` relation hydration). Remote providers
        // get the reader-based path — `resolve:true` is rejected there
        // because cross-model relation walks need local disk today.
        const listOpts = {
          locale: input.locale,
          filter: input.filter as Record<string, unknown>,
          resolve: input.resolve,
          limit: input.limit,
          offset: input.offset,
        }
        const result = projectRoot
          ? await listContent(projectRoot, model, listOpts, config)
          : await listContent(provider, model, listOpts, config)

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            ...normalizeOperationError(error, 'content_list'),
          }) }],
          isError: true,
        }
      }
    },
  )
}

/** Trim a validation issue to the fields that locate it, dropping empty ones. */
function describeIssue(issue: ValidationError): Record<string, string> {
  const out: Record<string, string> = {}
  if (issue.entry) out['entry'] = issue.entry
  if (issue.slug) out['slug'] = issue.slug
  if (issue.locale) out['locale'] = issue.locale
  if (issue.field) out['field'] = issue.field
  out['message'] = issue.message
  return out
}

/**
 * Does a validation issue belong to one of the entries this save is writing?
 *
 * The write gate blocks on errors, but `validateProject` inspects the whole model.
 * Without this filter, a pre-existing bad entry somewhere else in the model would
 * block an unrelated — and perfectly valid — save, leaving the caller stuck behind
 * a problem they did not create and may not be able to fix.
 *
 * Matching is by identity: entry ID for collections, slug for documents, and
 * locale alone for singletons and dictionaries, which have one record per locale.
 */
function touchesSavedEntries(
  issue: { entry?: string, slug?: string, locale?: string },
  results: ContentSaveEntryResult[],
): boolean {
  return results.some((r) => {
    if (issue.locale && r.locale && issue.locale !== r.locale) return false
    if (r.id) return issue.entry === r.id
    if (r.slug) return issue.slug === r.slug
    // Singleton / dictionary: the locale is the whole identity, and an issue with
    // no entry or slug is about the record itself.
    return !issue.entry && !issue.slug
  })
}
