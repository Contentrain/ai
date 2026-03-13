import { join } from 'node:path'
import { rm } from 'node:fs/promises'
import { readProjectManifest } from './config-reader.js'
import { emitTypes } from './type-emitter.js'
import { emitDataModules } from './data-emitter.js'
import { emitRuntimeModule, emitCjsWrapper } from './runtime-emitter.js'
import { injectImports } from './package-json.js'
import { readDir, writeText } from './utils.js'

export interface GenerateOptions {
  projectRoot: string
}

export interface GenerateResult {
  generatedFiles: string[]
  typesCount: number
  dataModulesCount: number
  packageJsonUpdated: boolean
}

export async function generate(options: GenerateOptions): Promise<GenerateResult> {
  const { projectRoot } = options
  const clientDir = join(projectRoot, '.contentrain', 'client')
  const dataDir = join(clientDir, 'data')

  // 1. Read project manifest
  const manifest = await readProjectManifest(projectRoot)

  // 2. Generate data modules (async — reads content files)
  const dataModules = await emitDataModules(manifest.models, manifest.contentFiles)

  // 3. Generate all output content (sync — pure string transforms)
  const typesContent = emitTypes(manifest.models)
  const runtimeContent = emitRuntimeModule(manifest.models, dataModules, manifest.config.locales.default)
  const cjsContent = emitCjsWrapper(manifest.models)

  // 4. Clean stale data modules
  const newFileNames = new Set(dataModules.map(dm => dm.fileName))
  try {
    const existing = await readDir(dataDir)
    await Promise.all(
      existing
        .filter(f => !newFileNames.has(f))
        .map(f => rm(join(dataDir, f), { force: true })),
    )
  } catch { /* dataDir may not exist yet */ }

  // 5. Write all files in parallel
  const dataFileNames = dataModules.map(dm => `data/${dm.fileName}`)
  await Promise.all([
    writeText(join(clientDir, 'index.d.ts'), typesContent),
    writeText(join(clientDir, 'index.mjs'), runtimeContent),
    writeText(join(clientDir, 'index.cjs'), cjsContent),
    ...dataModules.map(dm => writeText(join(dataDir, dm.fileName), dm.content)),
  ])

  // 6. Inject #imports into package.json
  const packageJsonUpdated = await injectImports(projectRoot)

  return {
    generatedFiles: ['index.d.ts', ...dataFileNames, 'index.mjs', 'index.cjs'],
    typesCount: manifest.models.length,
    dataModulesCount: dataModules.length,
    packageJsonUpdated,
  }
}
