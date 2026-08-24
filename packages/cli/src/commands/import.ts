import { defineCommand } from 'citty'
import { intro, outro, log, spinner } from '@clack/prompts'
import { createReadStream, existsSync } from 'node:fs'
import { mkdir, writeFile, access } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pc } from '../utils/ui.js'

// WordPress → .contentrain importer. Wraps @contentrain/wp-import:
// a WXR export file or a REST origin goes in; the canonical content store,
// an import report, and (when the source has comments) a
// contentrain-comments@1 export land on disk. Pure conversion happens in the
// library — this command only detects the source kind, guards the target,
// writes files, and narrates.

export default defineCommand({
  meta: {
    name: 'import',
    description: 'Import a WordPress site (WXR export file or REST URL) into a .contentrain content store',
  },
  args: {
    source: { type: 'positional', description: 'Path to a WXR .xml export, or a site URL (https://…)', required: true },
    out: { type: 'string', description: 'Target directory (default: current directory)', required: false },
    auth: { type: 'string', description: 'REST Application Password as user:password (lifts access to rest_auth)', required: false },
    force: { type: 'boolean', description: 'Overwrite an existing .contentrain directory', required: false },
    json: { type: 'boolean', description: 'JSON output for scripting', required: false },
  },
  async run({ args }) {
    const out = resolve(args.out ?? '.')
    const isUrl = /^https?:\/\//i.test(args.source)
    if (!isUrl && !existsSync(args.source)) {
      log.error(`Source not found: ${args.source}`)
      process.exitCode = 1
      return
    }
    const targetStore = join(out, '.contentrain')
    const storeExists = await access(targetStore).then(() => true, () => false)
    if (storeExists && !args.force) {
      log.error(`${targetStore} already exists — re-importing would overwrite models and content. Pass --force to proceed.`)
      process.exitCode = 1
      return
    }

    if (!args.json) intro(pc.bold('contentrain import'))
    const s = !args.json ? spinner() : null

    const { parseWxr, fetchRestRawIR, rawToContentrain, buildCommentsExport, summarizeComments } = await import('@contentrain/wp-import')

    s?.start(isUrl ? `Fetching ${args.source} over REST` : `Parsing ${args.source}`)
    let raw
    const warnings: string[] = []
    if (isUrl) {
      const [user, ...pw] = (args.auth ?? '').split(':')
      const auth = args.auth && user && pw.length ? { user, appPassword: pw.join(':') } : undefined
      const result = await fetchRestRawIR({ origin: args.source, auth, tool: 'contentrain-cli' })
      raw = result.raw
      warnings.push(...result.warnings)
    } else {
      const result = await parseWxr(createReadStream(args.source), { tool: 'contentrain-cli' })
      raw = result.raw
    }
    s?.stop(`Source read: ${raw.posts.length} posts, ${raw.attachments.length} media, ${raw.comments?.length ?? 0} comments (${raw.provenance.kind})`)

    s?.start('Converting to .contentrain')
    const { files, entry_source_map, report } = rawToContentrain(raw)
    if (raw.comments?.length) {
      const exp = buildCommentsExport(raw, entry_source_map)
      files['comments-export.json'] = `${JSON.stringify(exp, null, 2)}\n`
      const summary = summarizeComments(exp)
      if (summary.unresolved?.length) warnings.push(`${summary.unresolved.length} comments reference posts outside the import`)
    }
    files['entry-source-map.json'] = `${JSON.stringify(entry_source_map, null, 2)}\n`

    const dirs = new Set(Object.keys(files).map((p) => dirname(join(out, p))))
    await Promise.all([...dirs].map((d) => mkdir(d, { recursive: true })))
    await Promise.all(Object.entries(files).map(([path, content]) => writeFile(join(out, path), content, 'utf8')))
    s?.stop(`Wrote ${Object.keys(files).length} files to ${out}`)

    if (args.json) {
      console.log(JSON.stringify({ ok: true, out, report, warnings, comments: raw.comments?.length ?? 0 }, null, 2))
      return
    }
    for (const [id, m] of Object.entries(report.models)) {
      log.message(`${pc.cyan(id.padEnd(16))} ${m.kind.padEnd(10)} ${String(m.fields).padStart(3)} fields  ${String(m.entries).padStart(5)} entries`)
    }
    if (report.dropped_relations) log.warning(`${report.dropped_relations} relations pointed outside the import and were dropped (details in import-report.json)`)
    for (const w of warnings) log.warning(w)
    if (raw.comments?.length) log.info(`comments-export.json written (contentrain-comments@1) — ready for a comments-service intake`)
    outro(`Done. Next: ${pc.bold('contentrain validate')} to check the imported store.`)
  },
})
