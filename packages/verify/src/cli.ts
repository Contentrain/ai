// ─── contentrain-verify ───
//
// A thin shell over `verify()`: read a built directory, run the gates, print
// the report, return an exit code. Everything decisional lives in the library —
// this adds argument parsing and a number, nothing else. `bin.ts` is the
// executable; keeping the shell importable is what makes it testable without
// spawning a process.

import { readFile } from 'node:fs/promises'
import { verify, formatReport } from './verify.js'
import { loadSiteDirectory } from './load.js'
import { CHECK_GROUPS } from './types.js'
import type { CheckGroup, VerifyInput } from './types.js'

export const USAGE = `contentrain-verify <dist-dir> [options]

  --site <url>          Canonical origin, e.g. https://example.com
  --baseline <dir>      The old site, as a directory of captured pages
  --redirects <file>    JSON: [{ "from": "/a", "to": "/b", "status": 301 }]
  --source-origin <host>  The old host content was migrated away from
  --allow-host <host>     A host that may still be referenced (repeatable)
  --groups <list>       Comma-separated: ${CHECK_GROUPS.join(',')}
  --max-redirect-hops <n>
  --json                Print the report as JSON instead of text

Exits 1 when any finding is an error, 2 on a usage error.`

export interface Args {
  dir?: string
  site?: string
  sourceOrigin?: string
  allowHosts?: string[]
  baseline?: string
  redirects?: string
  groups?: CheckGroup[]
  maxRedirectHops?: number
  json: boolean
  help: boolean
}

export function parseArgs(argv: readonly string[]): Args {
  const args: Args = { json: false, help: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!
    const next = (): string | undefined => argv[++i]
    if (arg === '--help' || arg === '-h') args.help = true
    else if (arg === '--json') args.json = true
    else if (arg === '--site') args.site = next()
    else if (arg === '--source-origin') args.sourceOrigin = next()
    else if (arg === '--allow-host') (args.allowHosts ??= []).push(next() ?? '')
    else if (arg === '--baseline') args.baseline = next()
    else if (arg === '--redirects') args.redirects = next()
    else if (arg === '--max-redirect-hops') {
      const value = Number(next())
      if (!Number.isInteger(value) || value < 0) throw new Error('--max-redirect-hops expects a non-negative integer')
      args.maxRedirectHops = value
    } else if (arg === '--groups') {
      const list = (next() ?? '').split(',').map(g => g.trim()).filter(Boolean)
      const unknown = list.filter(g => !(CHECK_GROUPS as readonly string[]).includes(g))
      if (unknown.length) throw new Error(`unknown group(s): ${unknown.join(', ')}`)
      args.groups = list as CheckGroup[]
    } else if (arg.startsWith('-')) throw new Error(`unknown option: ${arg}`)
    else args.dir ??= arg
  }
  return args
}

export interface Console2 {
  log: (line: string) => void
  error: (line: string) => void
}

/** Returns the process exit code. `io` is injectable so tests read the output. */
export async function main(argv: readonly string[], io: Console2 = console): Promise<number> {
  let args: Args
  try {
    args = parseArgs(argv)
  } catch (error) {
    io.error(`${(error as Error).message}\n\n${USAGE}`)
    return 2
  }

  if (args.help || !args.dir) {
    io.log(USAGE)
    return args.help ? 0 : 2
  }

  const loaded = await loadSiteDirectory(args.dir, args.site)
  const options: VerifyInput['options'] = {}
  if (args.maxRedirectHops !== undefined) options.maxRedirectHops = args.maxRedirectHops
  if (args.sourceOrigin !== undefined) options.sourceOrigin = args.sourceOrigin
  if (args.allowHosts?.length) options.allowHosts = args.allowHosts

  const input: VerifyInput = {
    ...loaded,
    groups: args.groups,
    options: Object.keys(options).length ? options : undefined,
  }

  if (args.baseline) {
    const before = await loadSiteDirectory(args.baseline, args.site)
    input.baseline = { documents: before.documents }
  }
  if (args.redirects) {
    input.redirects = JSON.parse(await readFile(args.redirects, 'utf8')) as VerifyInput['redirects']
  }

  const report = verify(input)
  io.log(args.json ? JSON.stringify(report, null, 2) : formatReport(report))
  return report.passed ? 0 : 1
}
