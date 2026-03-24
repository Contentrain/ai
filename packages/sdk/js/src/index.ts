// Runtime exports — used by framework SDK authors and generated client
export { QueryBuilder } from './runtime/query.js'
export type { RelationMeta, RelationResolver } from './runtime/query.js'
export { SingletonAccessor } from './runtime/singleton.js'
export { DictionaryAccessor } from './runtime/dictionary.js'
export { DocumentQuery } from './runtime/document.js'

// Re-export types from @contentrain/types that SDK consumers need
export type {
  FieldType,
  ModelKind,
  ContentStatus,
  FieldDef,
  ModelDefinition,
  ContentrainConfig,
} from '@contentrain/types'

/**
 * Factory for framework SDK authors.
 * Returns the generated client module loaded from .contentrain/client/.
 *
 * Usage (Nuxt composable):
 * ```ts
 * import { createContentrainClient } from '@contentrain/query'
 * const client = createContentrainClient()
 * const posts = client.query('blog-post').locale('en').all()
 * ```
 */
export async function createContentrainClient(
  projectRoot?: string,
): Promise<{
  query: (model: string) => import('./runtime/query.js').QueryBuilder<Record<string, unknown>>
  singleton: (model: string) => import('./runtime/singleton.js').SingletonAccessor<Record<string, unknown>>
  dictionary: (model: string) => import('./runtime/dictionary.js').DictionaryAccessor
  document: (model: string) => import('./runtime/document.js').DocumentQuery<Record<string, unknown>>
}> {
  const { resolve } = await import('node:path')
  const { pathToFileURL } = await import('node:url')
  const root = projectRoot ?? process.cwd()
  const clientPath = resolve(root, '.contentrain', 'client', 'index.mjs')
  const client = await import(pathToFileURL(clientPath).href)
  return client
}

// CDN client factory — async, HTTP-based
export { createContentrain } from './cdn/index.js'
export type { ContentrainCDNConfig, ContentrainCDNClient } from './cdn/index.js'
export { ContentrainError } from './cdn/errors.js'

// Sync factory for CJS — requires generated client to be pre-loaded
export { createContentrainClient as default }
