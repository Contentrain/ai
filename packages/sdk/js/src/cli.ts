#!/usr/bin/env node

import { resolve } from 'node:path'
import { generate } from './generator/generate.js'

async function main() {
  const args = process.argv.slice(2)

  if (args[0] !== 'generate' && args.length === 0) {
    console.log('Usage: contentrain-query generate [--root <path>]')
    console.log('')
    console.log('Commands:')
    console.log('  generate    Generate typed client from .contentrain/ project files')
    console.log('')
    console.log('Options:')
    console.log('  --root      Project root directory (default: cwd)')
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
  } catch (err) {
    console.error('Generate failed:', (err as Error).message)
    process.exit(1)
  }
}

main()
