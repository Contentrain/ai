import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'

/**
 * Centralized tool annotations registry.
 * MCP clients use these hints to distinguish read-only vs. write vs. destructive tools.
 *
 * Also serves as the **single source of truth for the tool name list**. Consumers
 * that need to enumerate every registered tool (e.g. parity tests in
 * `@contentrain/rules` / `@contentrain/skills`) should import `TOOL_NAMES` below
 * rather than hardcoding the list.
 */
export const TOOL_ANNOTATIONS: Record<string, ToolAnnotations> = {
  // ─── Context (read-only) ───
  contentrain_status: {
    title: 'Project Status',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
  contentrain_describe: {
    title: 'Describe Model',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
  contentrain_describe_format: {
    title: 'Describe Format',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
  contentrain_doctor: {
    title: 'Project Health Report',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },

  // ─── Setup (write + git) ───
  contentrain_init: {
    title: 'Initialize Project',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
  },
  contentrain_scaffold: {
    title: 'Scaffold Template',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
  },

  // ─── Model (write + git) ───
  contentrain_model_save: {
    title: 'Save Model',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
  },
  contentrain_model_delete: {
    title: 'Delete Model',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
  },

  // ─── Content (mixed) ───
  contentrain_content_save: {
    title: 'Save Content',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
  },
  contentrain_content_delete: {
    title: 'Delete Content',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
  },
  contentrain_content_list: {
    title: 'List Content',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },

  // ─── Workflow (mixed) ───
  contentrain_validate: {
    title: 'Validate Project',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
  },
  contentrain_submit: {
    title: 'Submit Branches',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
  },
  contentrain_merge: {
    title: 'Merge Branch',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
  },

  // ─── Normalize (mixed) ───
  contentrain_scan: {
    title: 'Scan Source Code',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
  contentrain_apply: {
    title: 'Apply Normalize',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
  },

  // ─── Bulk (write + git) ───
  contentrain_bulk: {
    title: 'Bulk Operations',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
  },
}

/**
 * Canonical list of every registered MCP tool name, derived from the
 * single source of truth above. Re-exported here with a stable name so
 * parity tests in sibling packages (`@contentrain/rules`,
 * `@contentrain/skills`) can assert against it without depending on
 * `TOOL_ANNOTATIONS` internals.
 */
export const TOOL_NAMES: readonly string[] = Object.freeze(Object.keys(TOOL_ANNOTATIONS))
