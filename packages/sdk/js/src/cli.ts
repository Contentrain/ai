#!/usr/bin/env node

import { resolve, join } from 'node:path'
import { watch } from 'node:fs'
import { generate } from './generator/generate.js'

async function main() {
  const args = process.argv.slice(2)

  if (args[0] !== 'generate' && args.length === 0) {
    console.log('Usage: contentrain-query generate [--root <path>] [--watch]')
    console.log('')
    console.log('Commands:')
    console.log('  generate    Generate typed client from .contentrain/ project files')
    console.log('')
    console.log('Options:')
    console.log('  --root      Project root directory (default: cwd)')
    console.log('  --watch     Watch for changes and regenerate automatically')
    process.exit(0)
  }

  const command = args[0] === 'generate' ? 'generate' : args[0]

  if (command !== 'generate') {
    console.error(`Unknown command: ${command}`)
    process.exit(1)
  }

  const rootIdx = args.indexOf('--root')
  const rootArg = rootIdx !== -1 ? args[rootIdx + 1] : undefined
  const projectRoot = rootArg ? resolve(rootArg) : process.cwd()
  const watchMode = args.includes('--watch')

  try {
    const result = await generate({ projectRoot })

    console.log(`@contentrain/query — generated client`)
    console.log(`  Models:       ${result.typesCount}`)
    console.log(`  Data modules: ${result.dataModulesCount}`)
    console.log(`  Files:        ${result.generatedFiles.length}`)
    if (result.packageJsonUpdated) {
      console.log(`  package.json: #contentrain imports added`)
    }
    console.log(`  Output:       .contentrain/client/`)

    if (watchMode) {
      startWatch(projectRoot)
    }
  } catch (err) {
    console.error('Generate failed:', (err as Error).message)
    process.exit(1)
  }
}

function startWatch(projectRoot: string) {
  const crDir = join(projectRoot, '.contentrain')
  const modelsDir = join(crDir, 'models')
  const contentDir = join(crDir, 'content')

  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  const regenerate = async () => {
    try {
      const result = await generate({ projectRoot })
      console.log(`  Regenerated: ${result.typesCount} models, ${result.dataModulesCount} data modules`)
    } catch (err) {
      console.error('  Regenerate failed:', (err as Error).message)
    }
  }

  const onChange = (_event: string, filename: string | null) => {
    // Skip changes in the client output directory
    if (filename && filename.startsWith('client')) return

    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      console.log(`  Change detected: ${filename ?? 'unknown'}`)
      regenerate()
    }, 150)
  }

  try { watch(modelsDir, { recursive: true }, onChange) } catch { /* dir may not exist */ }
  try { watch(contentDir, { recursive: true }, onChange) } catch { /* dir may not exist */ }

  console.log('')
  console.log('Watching for changes in .contentrain/ ...')
  console.log('Press Ctrl+C to stop.')
}

main()
