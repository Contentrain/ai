// Image sizes the migration measured, keyed by the address content stores.
// The writer fills this object; the starter ships it empty. It is a module,
// not JSON under src/, because content JSON in src/ is what the query-only
// gate rejects: this is build data, not content.

export const MEDIA_SIZES: Readonly<Record<string, { width: number, height: number } | undefined>> = {}
