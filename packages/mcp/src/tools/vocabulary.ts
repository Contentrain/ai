import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { ToolProvider } from '../server.js'
import { readConfig } from '../core/config.js'
import { planVocabularyDelete, planVocabularySave } from '../core/ops/index.js'
import { buildBranchName } from '../git/transaction.js'
import { normalizeOperationError } from '../git/errors.js'
import { commitThroughProvider } from './commit-plan.js'
import { TOOL_ANNOTATIONS } from './annotations.js'

/**
 * Vocabulary write tools.
 *
 * The vocabulary is the one piece of `.contentrain/` that had no tool. The
 * rules forbid hand-editing that directory, so the only way to add a canonical
 * term was to break the rule — which a field report duly did, having no
 * alternative.
 *
 * These go through the same plan → commit path as content and models, so a
 * vocabulary change lands on a `cr/*` branch and obeys the project's workflow
 * like everything else.
 */
export function registerVocabularyTools(
  server: McpServer,
  provider: ToolProvider,
): void {
  // ─── contentrain_vocabulary_save ───
  server.tool(
    'contentrain_vocabulary_save',
    'Add or update canonical vocabulary terms. Terms nest as { "term-slug": { "en": "…", "tr": "…" } } — the OUTER key is the term, the INNER key is a locale. Merges with the existing vocabulary: a term you omit is untouched. Changes are auto-committed to git — do NOT manually edit .contentrain/vocabulary.json.',
    {
      terms: z.record(z.string(), z.record(z.string(), z.string())).describe(
        'Terms keyed by kebab-case term slug, each holding its translations keyed by locale code. Example: { "sign-in": { "en": "Sign in", "tr": "Giriş yap" } }',
      ),
    },
    TOOL_ANNOTATIONS['contentrain_vocabulary_save']!,
    async (input) => {
      const config = await readConfig(provider)
      if (!config) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Project not initialized. Run contentrain_init first.' }) }],
          isError: true,
        }
      }

      const readiness = await provider.checkWriteReadiness?.()
      if (readiness?.blocked) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            error: readiness.message,
            action: 'blocked',
            hint: 'Merge or delete old contentrain/* branches before creating new ones.',
          }, null, 2) }],
          isError: true,
        }
      }

      let plan: Awaited<ReturnType<typeof planVocabularySave>>
      try {
        plan = await planVocabularySave(provider, { terms: input.terms })
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            hint: 'Terms nest as { "term-slug": { "en": "…" } }. Grouping by locale at the top level is the usual mistake.',
          }, null, 2) }],
          isError: true,
        }
      }

      const termCount = plan.result.added.length + plan.result.updated.length
      try {
        const commit = await commitThroughProvider(provider, {
          branch: buildBranchName('vocabulary', 'save'),
          changes: plan.changes,
          message: `[contentrain] vocabulary: ${termCount} term(s)`,
          contextPayload: { tool: 'contentrain_vocabulary_save', model: 'vocabulary' },
        })

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            status: 'committed',
            added: plan.result.added,
            updated: plan.result.updated,
            total_terms: plan.result.total,
            commit: commit.commitSha,
            workflow_action: commit.workflowAction,
            ...(commit.base_advance ? { base_advance: commit.base_advance } : {}),
            ...(commit.remote_push ? { remote_push: commit.remote_push } : {}),
            ...(commit.warning ? { warning: commit.warning } : {}),
            ...(plan.advisories.length > 0 ? { advisories: plan.advisories } : {}),
          }, null, 2) }],
        }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            ...normalizeOperationError(error, 'vocabulary_save'),
          }) }],
          isError: true,
        }
      }
    },
  )

  // ─── contentrain_vocabulary_delete ───
  server.tool(
    'contentrain_vocabulary_delete',
    'Remove canonical vocabulary terms by slug. Content already using a term is not touched — the vocabulary only advises. Changes are auto-committed to git.',
    {
      terms: z.array(z.string()).min(1).describe('Term slugs to remove'),
      confirm: z.boolean().describe('Must be true — this deletes canonical terms'),
    },
    TOOL_ANNOTATIONS['contentrain_vocabulary_delete']!,
    async (input) => {
      if (!input.confirm) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            error: 'Deleting vocabulary terms requires confirm: true',
          }) }],
          isError: true,
        }
      }

      const config = await readConfig(provider)
      if (!config) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Project not initialized. Run contentrain_init first.' }) }],
          isError: true,
        }
      }

      const plan = await planVocabularyDelete(provider, { terms: input.terms })

      // Nothing matched — say so without spawning a branch for an empty commit.
      if (plan.changes.length === 0) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            status: 'no-op',
            deleted: [],
            missing: plan.result.missing,
            total_terms: plan.result.total,
            ...(plan.advisories.length > 0 ? { advisories: plan.advisories } : {}),
          }, null, 2) }],
        }
      }

      const readiness = await provider.checkWriteReadiness?.()
      if (readiness?.blocked) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            error: readiness.message,
            action: 'blocked',
          }, null, 2) }],
          isError: true,
        }
      }

      try {
        const commit = await commitThroughProvider(provider, {
          branch: buildBranchName('vocabulary', 'delete'),
          changes: plan.changes,
          message: `[contentrain] vocabulary: remove ${plan.result.deleted.length} term(s)`,
          contextPayload: { tool: 'contentrain_vocabulary_delete', model: 'vocabulary' },
        })

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            status: 'committed',
            deleted: plan.result.deleted,
            missing: plan.result.missing,
            total_terms: plan.result.total,
            commit: commit.commitSha,
            workflow_action: commit.workflowAction,
            ...(commit.base_advance ? { base_advance: commit.base_advance } : {}),
            ...(commit.remote_push ? { remote_push: commit.remote_push } : {}),
            ...(commit.warning ? { warning: commit.warning } : {}),
            ...(plan.advisories.length > 0 ? { advisories: plan.advisories } : {}),
          }, null, 2) }],
        }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            ...normalizeOperationError(error, 'vocabulary_delete'),
          }) }],
          isError: true,
        }
      }
    },
  )
}
