#!/usr/bin/env node
// The executable. Kept separate from `cli.ts` so the shell can be imported and
// tested without a module side effect that runs it.

import { main } from './cli.js'

main(process.argv.slice(2)).then(
  (code) => { process.exitCode = code },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 2
  },
)
