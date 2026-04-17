import { z } from 'zod'

/**
 * Zod schemas for `contentrain serve` HTTP write routes.
 *
 * Each schema validates the request body BEFORE it reaches the MCP
 * tool layer. Catches malformed payloads (wrong types, extra fields,
 * path-traversal candidates) with structured 400 errors instead of
 * propagating them into git operations where they would be much
 * harder to diagnose.
 *
 * Schemas are intentionally conservative — they match the loosest
 * shape the underlying MCP tool accepts. A request that passes the
 * schema is guaranteed to at least REACH the MCP tool; whether the
 * tool accepts it (e.g. for domain-specific validation) is a separate
 * concern surfaced as an MCP-level error.
 */

const branchNameRegex = /^cr\/[a-z0-9-_/]+(?:\/[a-z0-9-]+)*\/\d+-[a-z0-9]+$/u

/** `cr/*` feature branch name. Legacy `contentrain/*` is explicitly rejected — old branches are auto-migrated on init. */
export const BranchNameSchema = z.string()
  .min(1, 'Branch name is required')
  .regex(/^cr\//u, 'Branch must start with "cr/"')
  .refine((n: string) => branchNameRegex.test(n) || n.startsWith('cr/'), { message: 'Invalid branch name format' })

/** Body for `/api/content/:modelId/:entryId/fix`. */
export const ContentFixBodySchema = z.object({
  locale: z.string().min(1).optional(),
  data: z.record(z.string(), z.unknown()),
})

/** Body for `/api/branches/approve` and `/api/branches/reject` and `/api/normalize/approve`. */
export const BranchActionBodySchema = z.object({
  branch: BranchNameSchema,
})

/** Body for `/api/normalize/apply` — mirrors contentrain_apply tool input, slimmed. */
export const NormalizeApplyBodySchema = z.object({
  mode: z.enum(['extract', 'reuse']),
  dry_run: z.boolean().optional().default(true),
  extractions: z.array(z.unknown()).optional(),
  scope: z.object({
    model: z.string().optional(),
    domain: z.string().optional(),
  }).optional(),
  patches: z.array(z.unknown()).optional(),
}).passthrough()

/** Body for `/api/normalize/plan/approve`. */
export const NormalizePlanApproveBodySchema = z.object({
  models: z.array(z.string()).optional(),
})

/**
 * Body for `/api/normalize/plan/reject`. Currently the route only
 * deletes the plan file, but we validate the body shape anyway so
 * any future caller that wants to record a rejection reason has a
 * well-defined contract. Both an empty body and `{ reason? }` pass.
 */
export const NormalizePlanRejectBodySchema = z.object({
  reason: z.string().max(500).optional(),
}).optional()

/** Query params for `/api/normalize/file-context`. */
export const FileContextQuerySchema = z.object({
  file: z.string()
    .min(1)
    .refine((p: string) => !p.includes('..'), { message: 'Path traversal segments ("..") are not allowed' })
    .refine((p: string) => !p.startsWith('/') && !/^[a-zA-Z]:/u.test(p), { message: 'Absolute paths are not allowed' }),
  line: z.coerce.number().int().min(1).optional(),
  range: z.coerce.number().int().min(0).max(50).optional(),
})

/**
 * Parse a body with a schema and either return the typed value or
 * throw an h3-compatible 400 error. Keeps route handlers readable.
 *
 * Generic constraint is `z.ZodTypeAny` so the inferred type propagates
 * as `z.infer<T>` rather than the looser `T` that `z.ZodType<T>`
 * infers to at call sites.
 */
export function parseOrThrow<S extends z.ZodTypeAny>(
  schema: S,
  value: unknown,
  kind: 'body' | 'query' = 'body',
): z.infer<S> {
  const result = schema.safeParse(value)
  if (!result.success) {
    const details = result.error.issues
      .map((i: { path: (string | number)[], message: string }) => `${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('; ')
    const err = new Error(`Invalid ${kind}: ${details}`) as Error & { statusCode?: number, data?: unknown }
    err.statusCode = 400
    err.data = { issues: result.error.issues }
    throw err
  }
  return result.data
}
