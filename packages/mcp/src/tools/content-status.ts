import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { ToolProvider } from '../server.js'
import { readConfig } from '../core/config.js'
import { readModel } from '../core/model-manager.js'
import { planContentStatus } from '../core/ops/index.js'
import { buildBranchName } from '../git/transaction.js'
import { normalizeOperationError } from '../git/errors.js'
import { validateProject } from '../core/validator/index.js'
import { OverlayReader } from '../core/overlay-reader.js'
import { TOOL_ANNOTATIONS } from './annotations.js'
import { commitThroughProvider, divergenceNextSteps, gitReport, type CommitThroughProviderResult } from './commit-plan.js'
import { describeIssue, touchesSavedEntries } from './entry-issues.js'

function errorResult(payload: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
    isError: true,
  }
}

export function registerContentStatusTools(
  server: McpServer,
  provider: ToolProvider,
): void {
  server.tool(
    'contentrain_content_status',
    'Change the status of content entries — this is how an entry is published, unpublished or archived. '
    + 'Address records the way their meta is laid out: COLLECTION — "entry_ids"; DOCUMENT — "slugs"; SINGLETON and DICTIONARY — neither (one record per locale). '
    + 'i18n models change every supported locale unless "locale" is given. '
    + 'Setting status "published" validates the targeted entries first; if they have errors, nothing is committed. '
    + 'Records already at the requested status are reported as unchanged and not rewritten. '
    + 'contentrain_content_list shows each entry\'s current status under "meta". '
    + 'Changes are committed to git and follow the project\'s review or auto-merge workflow — do NOT manually edit .contentrain/meta files.',
    {
      model: z.string().describe('Model ID'),
      status: z.enum(['draft', 'in_review', 'published', 'rejected', 'archived']).describe('New status'),
      entry_ids: z.array(z.string()).optional().describe('Entry IDs (collection models only)'),
      slugs: z.array(z.string()).optional().describe('Document slugs (document models only) — a document is addressed by slug, the same identity contentrain_content_save uses'),
      locale: z.string().optional().describe('Scope the change to one locale (i18n models only; defaults to every supported locale)'),
    },
    TOOL_ANNOTATIONS['contentrain_content_status']!,
    async (input) => {
      const config = await readConfig(provider)
      if (!config) return errorResult({ error: 'Project not initialized. Run contentrain_init first.' })

      const model = await readModel(provider, input.model)
      if (!model) return errorResult({ error: `Model "${input.model}" not found` })

      // Each guard runs before any read of meta, so the caller gets a usable
      // error rather than an empty result.
      const keyedByEntry = model.kind === 'collection'
      const keyedBySlug = model.kind === 'document'
      const hasEntryIds = Boolean(input.entry_ids && input.entry_ids.length > 0)
      const hasSlugs = Boolean(input.slugs && input.slugs.length > 0)

      if (keyedBySlug && hasEntryIds) {
        return errorResult({ error: `Model "${input.model}" is a document model — documents are keyed by slug, not entry ID. Pass slugs instead of entry_ids.` })
      }
      if (keyedBySlug && !hasSlugs) {
        return errorResult({ error: `contentrain_content_status requires slugs for document model "${input.model}".` })
      }
      if (!keyedBySlug && hasSlugs) {
        return errorResult({ error: `slugs only apply to document models — "${input.model}" is a ${model.kind} model. ${keyedByEntry ? 'Pass entry_ids.' : 'Omit both entry_ids and slugs.'}` })
      }
      if (keyedByEntry && !hasEntryIds) {
        return errorResult({ error: `contentrain_content_status requires entry_ids for collection model "${input.model}".` })
      }
      if (!keyedByEntry && !keyedBySlug && hasEntryIds) {
        return errorResult({ error: `Model "${input.model}" is a ${model.kind} model — it has one meta record per locale, so entry_ids do not apply. Omit entry_ids.` })
      }
      if (input.locale && !config.locales.supported.includes(input.locale)) {
        return errorResult({ error: `Locale "${input.locale}" is not supported. Supported: [${config.locales.supported.join(', ')}]` })
      }

      let plan: Awaited<ReturnType<typeof planContentStatus>>
      try {
        plan = await planContentStatus(provider, {
          model,
          status: input.status,
          entryIds: input.entry_ids,
          slugs: input.slugs,
          locale: input.locale,
          config,
        })
      } catch (error) {
        return errorResult({ ...normalizeOperationError(error, 'content_status') })
      }

      const { changes, unchanged, not_found: notFound, locales } = plan.result

      if (changes.length === 0 && unchanged.length === 0) {
        return errorResult({
          error: keyedByEntry
            ? `No meta records found for the given entry_ids in model "${input.model}" across locales [${locales.join(', ')}]. Nothing was changed. Check the IDs with contentrain_content_list.`
            : keyedBySlug
              ? `No meta records found for the given slugs in model "${input.model}" across locales [${locales.join(', ')}]. Nothing was changed. Check the slugs with contentrain_content_list.`
              : `No meta record found for model "${input.model}" across locales [${locales.join(', ')}]. Nothing was changed.`,
          ...(notFound.length > 0 ? { not_found: notFound } : {}),
        })
      }

      // Everything already had this status: there is nothing to commit, and
      // saying so is the answer — calling twice is not an error.
      if (changes.length === 0) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            status: 'unchanged',
            message: `Every targeted record is already "${input.status}". Nothing was committed.`,
            content_status: input.status,
            changes: [],
            unchanged,
            ...(notFound.length > 0 ? { not_found: notFound } : {}),
          }, null, 2) }],
        }
      }

      // Publishing puts an entry in front of readers, so it gets the same gate
      // content_save has: validate over the plan, and refuse on errors in the
      // entries being published. Errors elsewhere in the model do not block —
      // the caller may not be able to fix them. Other statuses take an entry
      // out of delivery, which never needs a valid entry.
      let warnings: string[] = []
      if (input.status === 'published') {
        const validation = await validateProject(new OverlayReader(provider, plan.changes), { model: input.model })
        const blocking = validation.issues.filter(i => i.severity === 'error' && touchesSavedEntries(i, changes))
        if (blocking.length > 0) {
          return errorResult({
            error: 'Validation failed — nothing was published.',
            issues: blocking.map(describeIssue),
            hint: 'Fix the entries with contentrain_content_save, then call contentrain_content_status again. Nothing was committed, so there is no branch to clean up.',
          })
        }
        warnings = validation.issues
          .filter(i => i.severity === 'warning' && touchesSavedEntries(i, changes))
          .map(i => `${i.field ?? i.locale}: ${i.message}`)
      }

      // Write-readiness gate. The provider decides what blocks a write — a
      // local worktree counts unmerged cr/* branches, a hosted one does not.
      const readiness = await provider.checkWriteReadiness?.()
      if (readiness?.blocked) {
        return errorResult({
          error: readiness.message,
          action: 'blocked',
          hint: 'Merge or delete old cr/* branches before creating new ones.',
        })
      }

      const branch = buildBranchName('status', input.model, input.locale)
      const keys = [...new Set(changes.map(c => c.id ?? c.slug).filter((v): v is string => Boolean(v)))]
      let commit: CommitThroughProviderResult
      try {
        commit = await commitThroughProvider(provider, {
          branch,
          changes: plan.changes,
          message: `[contentrain] status: ${input.model} → ${input.status}`,
          contextPayload: {
            tool: 'contentrain_content_status',
            model: input.model,
            ...(input.locale ? { locale: input.locale } : {}),
            ...(keys.length > 0 ? { entries: keys } : {}),
          },
        })
      } catch (error) {
        return errorResult({ ...normalizeOperationError(error, 'content_status') })
      }

      const nextSteps = divergenceNextSteps(commit)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          status: 'committed',
          message: `Changed ${changes.length} record(s) to status "${input.status}".`,
          content_status: input.status,
          changes,
          unchanged,
          ...(notFound.length > 0 ? { not_found: notFound } : {}),
          validation: input.status === 'published' ? { valid: true, errors: [] } : { skipped: 'only publishing is validated' },
          ...(warnings.length > 0 ? { warnings } : {}),
          git: gitReport({ branch, action: commit.workflowAction, commit: commit.commitSha, sync: commit.sync, base_advance: commit.base_advance, remote_push: commit.remote_push, base_branch: commit.base_branch }),
          ...(commit.warning ? { warning: commit.warning } : {}),
          context_updated: true,
          next_steps: [
            ...nextSteps,
            ...(warnings.length > 0 ? ['REVIEW: see warnings above — the change was not blocked by them'] : []),
            'Use contentrain_content_list to verify — each entry shows its status under "meta"',
          ],
        }, null, 2) }],
      }
    },
  )
}
