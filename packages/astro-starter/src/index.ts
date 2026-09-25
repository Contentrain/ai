// The Astro + Contentrain starter a migration lays down, as a directory to copy.
// Published, it is the `template/` packed from templates/astro-starter; in this
// monorepo it is that directory itself, so a local build never reads a stale copy.

import { existsSync } from 'node:fs'
import { cp, rename } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const packed = fileURLToPath(new URL('../template', import.meta.url))
const workspace = fileURLToPath(new URL('../../../templates/astro-starter', import.meta.url))

/** The starter's root: its package.json, astro.config.mjs, src/, public/ and `.contentrain` store. */
export const STARTER_DIR: string = existsSync(packed) ? packed : workspace

/** npm never packs a `.gitignore`: the published template carries it under this name, and {@link copyStarter} restores it. */
export const PACKED_GITIGNORE = '_gitignore'

/**
 * Copies the starter into `target` as the site's own files. `filter` gets each path relative to the
 * starter's root (`''` for the root itself) and keeps it when it returns true. The `.gitignore` comes
 * out under its real name whether the starter is the packed template or this monorepo's directory.
 */
export async function copyStarter(target: string, options: { filter?: (path: string) => boolean } = {}): Promise<void> {
  const keep = options.filter ?? (() => true)
  await cp(STARTER_DIR, target, { recursive: true, filter: source => keep(relative(STARTER_DIR, source)) })
  if (existsSync(join(target, PACKED_GITIGNORE))) await rename(join(target, PACKED_GITIGNORE), join(target, '.gitignore'))
}
