import { join } from 'node:path'
import { readJson, writeText } from './utils.js'

const IMPORTS_CONFIG = {
  '#contentrain': {
    types: './.contentrain/client/index.d.ts',
    import: './.contentrain/client/index.mjs',
    require: './.contentrain/client/index.cjs',
    default: './.contentrain/client/index.mjs',
  },
  '#contentrain/*': {
    types: './.contentrain/client/*.d.ts',
    import: './.contentrain/client/*.mjs',
    require: './.contentrain/client/*.cjs',
    default: './.contentrain/client/*.mjs',
  },
}

export async function injectImports(projectRoot: string): Promise<boolean> {
  const pkgPath = join(projectRoot, 'package.json')
  const pkg = await readJson<Record<string, unknown>>(pkgPath)
  if (!pkg) return false

  const existing = (pkg['imports'] as Record<string, unknown>) ?? {}
  const updated = { ...existing, ...IMPORTS_CONFIG }

  // Check if already matches
  if (JSON.stringify(existing['#contentrain']) === JSON.stringify(IMPORTS_CONFIG['#contentrain']) &&
      JSON.stringify(existing['#contentrain/*']) === JSON.stringify(IMPORTS_CONFIG['#contentrain/*'])) {
    return false // No change needed
  }

  pkg['imports'] = updated
  await writeText(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
  return true
}
