import { defineCommand } from 'citty'
import { intro, outro, log } from '@clack/prompts'
import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import type { EntrySourceMap, SourceDeltaPlan } from '@contentrain/types'
import { pc } from '../utils/ui.js'

// WordPress source delta → a reviewable plan. Wraps @contentrain/wp-import's
// planSourceDelta: a bridge's SourceDeltaPlan, the repository's store and the
// new export go in; every record comes out placed in the store (or unmapped,
// with the reason), with field-level differences, conflicts with repository
// edits, tombstones and redirects. Planning only — applying a plan is a
// governed write that goes through review, so this command has no apply mode.

/** Every file under `<dir>/.contentrain`, keyed repo-relative. */
async function readStoreFiles(dir: string): Promise<Record<string, string>> {
  const root = join(dir, '.contentrain')
  const entries = await readdir(root, { recursive: true, withFileTypes: true })
  const paths = entries.filter(entry => entry.isFile()).map(entry => join(entry.parentPath, entry.name))
  const texts = await Promise.all(paths.map(path => readFile(path, 'utf8')))
  return Object.fromEntries(paths.map((path, i) => [relative(dir, path), texts[i]!]))
}

/** The source map the store was built from: the bridge's, or the one `contentrain import` writes. */
async function readSourceMap(dir: string): Promise<EntrySourceMap | undefined> {
  for (const path of [join(dir, 'bridge/entry-source-map.json'), join(dir, 'entry-source-map.json')]) {
    if (existsSync(path)) return JSON.parse(await readFile(path, 'utf8')) as EntrySourceMap
  }
  return undefined
}

/** Taxonomies the bridge inventoried, when its inventory is beside the export. */
async function readTaxonomies(dir: string): Promise<string[]> {
  const path = join(dir, 'bridge/inventory.json')
  if (!existsSync(path)) return []
  const inventory = JSON.parse(await readFile(path, 'utf8')) as { scope?: { taxonomies?: string[] } }
  return inventory.scope?.taxonomies ?? []
}

export default defineCommand({
  meta: {
    name: 'delta',
    description: 'Plan a WordPress source delta against the store (dry run only; applying goes through review)',
  },
  args: {
    delta: { type: 'positional', description: 'Path to the SourceDeltaPlan JSON a bridge wrote', required: true },
    incoming: { type: 'string', description: 'Directory of the new export (its .contentrain/ and entry-source-map.json)', required: false },
    store: { type: 'string', description: 'Directory of the repository store (default: current directory)', required: false },
    taxonomy: { type: 'string', description: 'Comma-separated custom taxonomies (term ids, never looked up in the post map)', required: false },
    'dry-run': { type: 'boolean', description: 'Required: report the plan without writing anything', required: false },
    json: { type: 'boolean', description: 'Print the planned SourceDeltaPlan as JSON', required: false },
  },
  async run({ args }) {
    if (!args['dry-run']) {
      log.error('contentrain delta only plans. Pass --dry-run; applying a plan goes through review, not this command.')
      process.exitCode = 1
      return
    }
    const deltaPath = resolve(args.delta)
    const storeDir = resolve(args.store ?? '.')
    const incomingDir = args.incoming ? resolve(args.incoming) : undefined
    for (const [label, path] of [['Delta', deltaPath], ['Store', join(storeDir, '.contentrain')], ...(incomingDir ? [['Incoming export', join(incomingDir, '.contentrain')]] : [])]) {
      if (!existsSync(path!)) {
        log.error(`${label} not found: ${path}`)
        process.exitCode = 1
        return
      }
    }
    const storeMap = await readSourceMap(storeDir)
    if (!storeMap) {
      log.error(`No entry-source-map.json in ${storeDir} (or its bridge/) — without it no post can be placed.`)
      process.exitCode = 1
      return
    }

    const { DEFAULT_TAXONOMIES, formatSourceDeltaReport, planSourceDelta } = await import('@contentrain/wp-import')
    const delta = JSON.parse(await readFile(deltaPath, 'utf8')) as SourceDeltaPlan
    const store = { files: await readStoreFiles(storeDir), entry_source_map: storeMap }
    const incoming = incomingDir
      ? { files: await readStoreFiles(incomingDir), entry_source_map: (await readSourceMap(incomingDir)) ?? {} }
      : undefined
    const custom = (args.taxonomy ?? '').split(',').map(name => name.trim()).filter(Boolean)
    const taxonomies = [...new Set([...DEFAULT_TAXONOMIES, ...(incomingDir ? await readTaxonomies(incomingDir) : []), ...custom])]

    const plan = planSourceDelta({ delta, store, incoming, taxonomies })
    if (args.json) {
      console.log(JSON.stringify(plan, null, 2))
      return
    }
    intro(pc.bold('contentrain delta --dry-run'))
    log.message(formatSourceDeltaReport(plan).trimEnd())
    const conflicts = plan.entries.filter(entry => entry.conflict).length
    outro(conflicts ? `${conflicts} conflict(s) need a decision before this plan is applied.` : 'Plan ready for review.')
  },
})
