// @contentrain/wp-import — WordPress importers for the Contentrain migration
// pipeline. Three stages, all pure where purity is possible:
//
//   WXR file or REST API ──► RawIR (source-faithful, provenance-stamped)
//   RawIR ──► .contentrain content store (pure file map) + EntrySourceMap
//   RawIR + EntrySourceMap ──► CommentsExport (live-service intake payload)
//
// Ported from the measured import chain — identity formulas, meta decoding,
// and resolution passes carried over intact so WXR and REST imports of the
// same site agree on every entry id.

export { parseWxr } from './wxr.js'
export type { WxrParseResult, WxrStats } from './wxr.js'
export { fetchRestRawIR } from './rest.js'
export type { RestImportOptions, RestImportResult } from './rest.js'
export { rawToContentrain } from './contentrain.js'
export type { ContentrainResult, ImportReport } from './contentrain.js'
export { buildCommentsExport, summarizeComments } from './comments.js'
export { looksSerialized, phpUnserialize, tryUnserialize } from './php-unserialize.js'
export type { UnserializeResult } from './php-unserialize.js'
export { canon, hexId, slugify, strip, taxModelId } from './core.js'
