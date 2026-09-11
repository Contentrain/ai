// ─── Reading a built directory ───
//
// The one place this package touches a filesystem. Kept apart from the checks
// so the engine stays pure: a consumer that already holds the documents — a
// migration runner, a CI step with an artefact — imports `verify` and never
// loads this module.

import { readFile, readdir } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import type { VerifyDocument, VerifyInput } from './types.js'

const DOCUMENT_EXT = /\.html?$/i

async function walk(dir: string, root: string, files: string[] = []): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      await walk(full, root, files)
      continue
    }
    files.push(relative(root, full))
  }
  return files
}

/**
 * Load a static build as a verification input: every `.html` becomes a
 * document served at its path, everything else becomes an asset.
 *
 * `dist/about/index.html` is served at `/about/`, which `identity()` then
 * reduces to `/about` — the same address a link to `/about/` or
 * `/about/index.html` resolves to.
 */
export async function loadSiteDirectory(dir: string, site?: string): Promise<Pick<VerifyInput, 'documents' | 'assets' | 'sitemap' | 'site'>> {
  const files = await walk(dir, dir)
  const documents: VerifyDocument[] = []
  const assets: string[] = []
  let sitemap: string | undefined

  for (const file of files.toSorted()) {
    const served = `/${file.split(sep).join('/')}`
    if (DOCUMENT_EXT.test(file)) {
      documents.push({ url: served, html: await readFile(join(dir, file), 'utf8'), status: 200 })
      continue
    }
    if (/^\/sitemap[^/]*\.xml$/i.test(served)) sitemap = await readFile(join(dir, file), 'utf8')
    assets.push(served)
  }

  return { documents, assets, sitemap, site }
}
