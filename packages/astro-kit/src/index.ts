import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { KitCatalog } from './catalog.js'

export * from './catalog.js'
export * from './copy.js'

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** The kit's `components/` directory — the source `copyComponents` copies from. */
export const KIT_COMPONENTS_DIR = join(PACKAGE_ROOT, 'components')

/** The published catalog (`catalog.json`). */
export async function loadCatalog(): Promise<KitCatalog> {
  return JSON.parse(await readFile(join(PACKAGE_ROOT, 'catalog.json'), 'utf8')) as KitCatalog
}
