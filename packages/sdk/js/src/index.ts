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
