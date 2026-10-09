import { defineCommand } from 'citty'
import { intro, outro, log, spinner, password, isCancel } from '@clack/prompts'
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

/** `user:password` for REST, read from the environment so it stays out of argv and shell history. */
export const WP_AUTH_ENV = 'CONTENTRAIN_WP_AUTH'
/** The Application Password alone, for `--auth <user>`. */
export const WP_APP_PASSWORD_ENV = 'CONTENTRAIN_WP_APP_PASSWORD'

export interface RestAuthResolution {
  auth?: { user: string; appPassword: string }
  /** Set when the credential came from argv: the caller warns that the form is deprecated. */
  deprecatedArgv?: boolean
  error?: string
}

/** `user:password` → parts; the password may itself contain colons. */
const splitUserPassword = (value: string): { user: string; appPassword: string } | undefined => {
  const i = value.indexOf(':')
  if (i <= 0 || i === value.length - 1) return undefined
  return { user: value.slice(0, i), appPassword: value.slice(i + 1) }
}

/**
 * Where the REST credential comes from, in order:
 * 1. `--auth user:password` — still works, but argv lands in shell history and
 *    process listings, so the caller prints a deprecation warning.
 * 2. `--auth user` — the password from `CONTENTRAIN_WP_APP_PASSWORD`, else an
 *    interactive hidden prompt (only when `interactive`).
 * 3. `CONTENTRAIN_WP_AUTH=user:password` in the environment.
 * Nothing given → anonymous REST.
 */
export async function resolveRestAuth(input: {
  auth?: string
  env: Record<string, string | undefined>
  interactive: boolean
  prompt?: (user: string) => Promise<string | undefined>
}): Promise<RestAuthResolution> {
  const flag = input.auth?.trim()
  if (flag) {
    if (flag.includes(':')) {
      const auth = splitUserPassword(flag)
      return auth ? { auth, deprecatedArgv: true } : { error: '--auth expects a user name (the password comes from the environment or a prompt)' }
    }
    const fromEnv = input.env[WP_APP_PASSWORD_ENV]
    if (fromEnv) return { auth: { user: flag, appPassword: fromEnv } }
    if (input.interactive && input.prompt) {
      const pw = await input.prompt(flag)
      if (pw) return { auth: { user: flag, appPassword: pw } }
      return { error: 'No Application Password entered' }
    }
    return { error: `--auth ${flag} needs the Application Password in ${WP_APP_PASSWORD_ENV} (or run in a terminal to be prompted)` }
  }
  const envAuth = input.env[WP_AUTH_ENV]
  if (envAuth) {
    const auth = splitUserPassword(envAuth)
    return auth ? { auth } : { error: `${WP_AUTH_ENV} must be user:password` }
  }
  return {}
}

export default defineCommand({
  meta: {
    name: 'import',
    description: 'Import a WordPress site (WXR export file or REST URL) into a .contentrain content store',
  },
  args: {
    source: { type: 'positional', description: 'Path to a WXR .xml export, or a site URL (https://…)', required: true },
    out: { type: 'string', description: 'Target directory (default: current directory)', required: false },
    auth: {
      type: 'string',
      description: `REST user for an Application Password (lifts access to rest_auth). The password comes from ${WP_APP_PASSWORD_ENV} or a prompt; ${WP_AUTH_ENV}=user:password also works. user:password here is deprecated`,
      required: false,
    },
    'include-emails': {
      type: 'boolean',
      description: 'Write author and commenter e-mail addresses from a WXR export into the store (default: left out — they are personal data and the store usually lands in git)',
      required: false,
    },
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
      const resolved = await resolveRestAuth({
        auth: args.auth,
        env: process.env,
        interactive: !args.json && Boolean(process.stdin.isTTY),
        prompt: async (user) => {
          s?.stop('Credential needed')
          const value = await password({ message: `Application Password for ${user}` })
          s?.start(`Fetching ${args.source} over REST`)
          return isCancel(value) ? undefined : value
        },
      })
      if (resolved.error) {
        s?.stop('Credential missing')
        log.error(resolved.error)
        process.exitCode = 1
        return
      }
      if (resolved.deprecatedArgv) {
        const msg = `--auth user:password is deprecated: the password lands in shell history and process listings. Use --auth <user> with ${WP_APP_PASSWORD_ENV} (or the prompt), or ${WP_AUTH_ENV}=user:password`
        if (args.json) process.stderr.write(`warning: ${msg}\n`)
        else log.warning(msg)
      }
      const auth = resolved.auth
      const result = await fetchRestRawIR({ origin: args.source, auth, tool: 'contentrain-cli' })
      raw = result.raw
      warnings.push(...result.warnings)
    } else {
      const result = await parseWxr(createReadStream(args.source), { tool: 'contentrain-cli' })
      raw = result.raw
    }
    s?.stop(`Source read: ${raw.posts.length} posts, ${raw.attachments.length} media, ${raw.comments?.length ?? 0} comments (${raw.provenance.kind})`)

    s?.start('Converting to .contentrain')
    const includeEmails = Boolean(args['include-emails'])
    const { files, entry_source_map, report } = rawToContentrain(raw, { includeEmails })
    if (raw.comments?.length) {
      const exp = buildCommentsExport(raw, entry_source_map, { includeEmails })
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
    if (report.password_protected_drafts) log.warning(`${report.password_protected_drafts} password-protected posts brought in as drafts — their body is the protected text; publish one only after deciding what it should show`)
    if (report.dropped_relations) log.warning(`${report.dropped_relations} relations pointed outside the import and were dropped (details in import-report.json)`)
    for (const w of warnings) log.warning(w)
    if (includeEmails && raw.provenance.kind === 'wxr') log.warning('Author and commenter e-mail addresses were written into the store (--include-emails). They are personal data: keep this repository private')
    if (raw.comments?.length) log.info(`comments-export.json written (contentrain-comments@1) — ready for a comments-service intake`)
    outro(`Done. Next: ${pc.bold('contentrain validate')} to check the imported store.`)
  },
})
