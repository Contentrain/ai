import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ModelDefinition } from '@contentrain/types'
import type { ContentFileRef } from './config-reader.js'

export interface PublicationOptions {
  /** Opt in for public builds; the default keeps the existing editorial client. */
  publishedOnly?: boolean
  /** ISO timestamp for a reproducible public build. Implies publishedOnly. */
  at?: string
}

export interface PublicationContext {
  projectRoot: string
  defaultLocale: string
  at: number
}

export function publicationContext(projectRoot: string, defaultLocale: string, options: PublicationOptions): PublicationContext | undefined {
  if (!options.publishedOnly && options.at === undefined) return undefined
  if (options.at !== undefined && !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(options.at))
    throw new Error('Invalid publication --at timestamp: include an ISO date, time and timezone')
  const at = options.at === undefined ? Date.now() : Date.parse(options.at)
  if (!Number.isFinite(at)) throw new Error('Invalid publication --at timestamp')
  return { projectRoot, defaultLocale, at }
}

/** Canonical meta is independent of custom content paths and locale strategies. */
export async function publicationMeta(ref: ContentFileRef, model: ModelDefinition, context: PublicationContext): Promise<Record<string, unknown> | undefined> {
  const locale = model.i18n ? ref.locale ?? context.defaultLocale : context.defaultLocale
  const parts = [context.projectRoot, '.contentrain', 'meta', model.id]
  if (model.kind === 'document') parts.push(ref.slug ?? model.id)
  const path = join(...parts, `${locale}.json`)
  let text: string
  try { text = await readFile(path, 'utf8') }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
  const meta: unknown = JSON.parse(text)
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) throw new Error(`Invalid publication metadata: ${path}`)
  return meta as Record<string, unknown>
}

/** Legacy content without meta remains visible, matching Studio's CDN contract. */
export function isPublishedAt(meta: unknown, at: number): boolean {
  if (meta === undefined) return true
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return false
  const value = meta as Record<string, unknown>
  if (value.status && value.status !== 'published') return false
  for (const key of ['publish_at', 'expire_at'] as const) {
    if (value[key] === undefined || value[key] === null) continue
    const time = typeof value[key] === 'string' ? Date.parse(value[key]) : NaN
    if (!Number.isFinite(time)) return false
    if (key === 'publish_at' ? time > at : time <= at) return false
  }
  return true
}
