import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { KitBuilder, KitCatalog } from './catalog.js'
import type { MappingTable } from './mapping.js'

export * from './catalog.js'
export * from './copy.js'
export * from './mapping.js'

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** The kit's `components/` directory — the source `copyComponents` copies from. */
export const KIT_COMPONENTS_DIR = join(PACKAGE_ROOT, 'components')

/** A builder's mapping table (`mapping/<builder>.json`). */
export async function loadMapping(builder: KitBuilder): Promise<MappingTable> {
  return JSON.parse(await readFile(join(PACKAGE_ROOT, 'mapping', `${builder}.json`), 'utf8')) as MappingTable
}

/** The published catalog (`catalog.json`). */
export async function loadCatalog(): Promise<KitCatalog> {
  return JSON.parse(await readFile(join(PACKAGE_ROOT, 'catalog.json'), 'utf8')) as KitCatalog
}
