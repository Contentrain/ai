import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'

/**
 * Centralized tool annotations registry.
 * MCP clients use these hints to distinguish read-only vs. write vs. destructive tools.
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
