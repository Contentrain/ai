import {
  createApp,
  createRouter,
  defineEventHandler,
  toNodeListener,
  getRouterParam,
  readBody,
  getQuery,
  createError,
} from 'h3'
import { WebSocketServer, type WebSocket as WS } from 'ws'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { createServer as createMcpServer } from '@contentrain/mcp/server'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { watch } from 'chokidar'
import { join } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { readFile, unlink, writeFile } from 'node:fs/promises'
import { simpleGit } from 'simple-git'
import { CONTENTRAIN_BRANCH, LOCAL_CAPABILITIES } from '@contentrain/types'
import { mergeBranch } from '@contentrain/mcp/git/transaction'
import { branchDiff, checkBranchHealth } from '@contentrain/mcp/git/branch-lifecycle'
import { readConfig } from '@contentrain/mcp/core/config'
import {
  BranchActionBodySchema,
  ContentFixBodySchema,
  FileContextQuerySchema,
  NormalizeApplyBodySchema,
  NormalizePlanApproveBodySchema,
  NormalizePlanRejectBodySchema,
  parseOrThrow,
} from './schemas.js'

interface ServeOptions {
  projectRoot: string
  port: number
  uiDir: string
}

function apiError(error: unknown): { statusCode: number; error: string } {
  if (error && typeof error === 'object' && 'statusCode' in error) {
    const e = error as { statusCode: number; message?: string }
    return { statusCode: e.statusCode, error: e.message ?? 'Unknown error' }
  }
  const message = error instanceof Error ? error.message : String(error)
  return { statusCode: 500, error: message }
}

export async function createServeApp(options: ServeOptions) {
  const { projectRoot, uiDir } = options
  const crDir = join(projectRoot, '.contentrain')

  function getDefaultBranch(): string {
    try {
      const raw = readFileSync(join(crDir, 'config.json'), 'utf-8')
      const cfg = JSON.parse(raw)
      if (cfg?.repository?.default_branch) return cfg.repository.default_branch
    } catch { /* ignore */ }
    return 'main'
  }

  /**
   * In-memory cache of post-merge sync warnings. Keyed by feature
   * branch name; populated when `mergeBranch()` returns skipped
   * files (the developer had uncommitted `.contentrain/` changes).
   * The UI can fetch the full list from `/api/branches/:name/sync-status`
   * without replaying the merge. Entries expire after the branch is
   * rejected or after 1 hour of inactivity.
   */
  interface SyncWarning {
    branch: string
    skipped: string[]
    synced: string[]
    recordedAt: number
  }
  const syncWarnings = new Map<string, SyncWarning>()
  const SYNC_WARNING_TTL_MS = 60 * 60 * 1000

  // --- MCP Client setup ---
  const mcpServer = createMcpServer(projectRoot)
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const mcpClient = new Client({ name: 'serve-client', version: '1.0.0' })

  await Promise.all([
    mcpClient.connect(clientTransport),
    mcpServer.connect(serverTransport),
  ])

  async function callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    const result = await mcpClient.callTool({ name, arguments: args })
    const contentArr = result.content as Array<{ type: string; text?: string }>
    const textContent = contentArr.find((c: { type: string }) => c.type === 'text')
    if (!textContent || !('text' in textContent)) {
      throw createError({ statusCode: 500, message: `Tool ${name} returned no text content` })
    }
    const parsed = JSON.parse(textContent.text as string)
    if (result.isError) {
      const msg = typeof parsed === 'object' && parsed?.error ? parsed.error : textContent.text
      throw createError({ statusCode: 422, message: msg as string })
    }
    return parsed
  }



  // --- H3 App ---
  const app = createApp({
    onError: (error, event) => {
      if (event.path.startsWith('/api/')) {
        const { statusCode, error: message } = apiError(error)
        event.node.res.statusCode = statusCode
        event.node.res.setHeader('Content-Type', 'application/json')
        if (!event.node.res.writableEnded) {
          event.node.res.end(JSON.stringify({ statusCode, error: message }))
        }
      }
    },
  })
  const router = createRouter()

  // --- WebSocket for file watching (ws package) ---
  const wss = new WebSocketServer({ noServer: true })
  const wsClients = new Set<WS>()

  function broadcast(event: Record<string, unknown>) {
    const data = JSON.stringify(event)
    for (const client of wsClients) {
      if (client.readyState === 1 /* OPEN */) {
        client.send(data)
      }
    }
  }

  wss.on('connection', (ws) => {
    wsClients.add(ws)
    ws.send(JSON.stringify({ type: 'connected' }))
    ws.on('close', () => { wsClients.delete(ws) })
    ws.on('error', () => { wsClients.delete(ws) })
  })

  // WebSocket upgrade handler — called from serve command
  function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
    if (req.url !== '/ws') { socket.destroy(); return }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req)
    })
  }

  // --- File Watcher ---
  if (existsSync(crDir)) {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const pendingEvents: Record<string, unknown>[] = []

    const watcher = watch(crDir, {
      ignoreInitial: true,
      ignored: ['**/node_modules/**', '**/.git/**'],
      depth: 4,
    })

    function flush() {
      if (pendingEvents.length === 0) return
      const events = [...pendingEvents]
      pendingEvents.length = 0
      for (const event of events) broadcast(event)
    }

    watcher.on('all', (_eventType, filePath) => {
      const rel = filePath.replace(crDir, '').replace(/^\//, '')

      let event: Record<string, unknown>
      if (rel === 'config.json') {
        event = { type: 'config:changed' }
      } else if (rel === 'context.json') {
        let context: unknown = null
        try {
          const raw = readFileSync(join(crDir, 'context.json'), 'utf-8')
          context = JSON.parse(raw)
        } catch { /* ignore */ }
        event = { type: 'context:changed', context }
      } else if (rel === 'normalize-plan.json') {
        event = { type: 'normalize:plan-updated' }
      } else if (rel.startsWith('models/')) {
        const modelId = rel.replace('models/', '').replace('.json', '')
        event = { type: 'model:changed', modelId }
      } else if (rel.startsWith('content/')) {
        const parts = rel.replace('content/', '').split('/')
        event = { type: 'content:changed', modelId: parts[1], locale: parts[2]?.replace('.json', '') }
      } else if (rel.startsWith('meta/') && rel.endsWith('.json')) {
        // `.contentrain/meta/<model>/<locale>.json` and
        // `.contentrain/meta/<model>/<entryId>/<locale>.json` — SEO and
        // model-level metadata edited independently of content. The
        // Serve UI's model inspector and SEO panels consume this.
        const parts = rel.replace('meta/', '').split('/')
        const locale = parts[parts.length - 1]?.replace('.json', '')
        const modelId = parts[0]
        const entryId = parts.length === 3 ? parts[1] : undefined
        event = entryId
          ? { type: 'meta:changed', modelId, entryId, locale }
          : { type: 'meta:changed', modelId, locale }
      } else {
        return
      }

      pendingEvents.push(event)
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(flush, 300)
    })

    // Surface watcher failures instead of silently degrading to a
    // no-op. Without this the UI keeps rendering stale data after,
    // e.g., hitting the OS inotify limit — the user has no way to
    // know live updates stopped flowing.
    watcher.on('error', (err) => {
      const message = err instanceof Error ? err.message : String(err)
      broadcast({ type: 'file-watch:error', message, timestamp: new Date().toISOString() })
    })
  }

  // --- API Routes ---

  // Status
  router.add('/api/status', defineEventHandler(async () => {
    return await callTool('contentrain_status')
  }))

  // Capabilities + transport + provider info
  //
  // Surfaces the data the UI needs to render its "what can this
  // project do?" badge: provider type (local/github/gitlab), the
  // active transport, capability manifest, content-tracking branch,
  // and aggregated branch-health. Kept in ONE route so the Dashboard
  // can render the badge in a single round trip instead of stitching
  // together /status + /branches.
  router.add('/api/capabilities', defineEventHandler(async () => {
    const config = await readConfig(projectRoot).catch(() => null)
    const health = await checkBranchHealth(projectRoot).catch(() => null)
    return {
      version: 1,
      provider: {
        type: 'local' as const,
        repo: config?.repository ?? null,
      },
      transport: 'stdio' as const,
      capabilities: LOCAL_CAPABILITIES,
      contentBranch: CONTENTRAIN_BRANCH,
      defaultBranch: getDefaultBranch(),
      branchHealth: health,
    }
  }))

  // Sync warnings for a specific branch — populated the last time
  // `mergeBranch()` ran for that branch and skipped dirty files.
  // Returns { warning: null } when no warnings are cached.
  router.add('/api/branches/:name/sync-status', defineEventHandler(async (event) => {
    const name = getRouterParam(event, 'name')
    if (!name) throw createError({ statusCode: 400, message: 'Missing branch name' })
    // Expire stale entries on read.
    const warning = syncWarnings.get(name)
    if (warning && Date.now() - warning.recordedAt > SYNC_WARNING_TTL_MS) {
      syncWarnings.delete(name)
      return { warning: null }
    }
    return { warning: warning ?? null }
  }))

  // Describe model
  router.add('/api/describe/:modelId', defineEventHandler(async (event) => {
    const modelId = getRouterParam(event, 'modelId')
    return await callTool('contentrain_describe', { model: modelId, include_sample: true })
  }))

  // Format reference — thin wrapper around contentrain_describe_format.
  // Serves a static spec of how Contentrain stores models, content,
  // meta, and vocabulary. The UI renders this as a reference panel for
  // humans who want to learn the file layout without reading docs.
  router.add('/api/describe-format', defineEventHandler(async () => {
    return await callTool('contentrain_describe_format')
  }))

  // Content list
  router.add('/api/content/:modelId', defineEventHandler(async (event) => {
    const modelId = getRouterParam(event, 'modelId')
    const query = getQuery(event)
    return await callTool('contentrain_content_list', {
      model: modelId,
      locale: query['locale'] as string | undefined,
      limit: query['limit'] ? Number(query['limit']) : undefined,
      offset: query['offset'] ? Number(query['offset']) : undefined,
    })
  }))

  // Content read (single entry)
  router.add('/api/content/:modelId/:entryId', defineEventHandler(async (event) => {
    const modelId = getRouterParam(event, 'modelId')
    const entryId = getRouterParam(event, 'entryId')
    const query = getQuery(event)
    return await callTool('contentrain_content_list', {
      model: modelId,
      locale: query['locale'] as string | undefined,
      filter: { id: entryId },
      limit: 1,
    })
  }))

  // Quick fix (content save)
  router.add('/api/content/:modelId/:entryId/fix', defineEventHandler(async (event) => {
    if (event.method !== 'POST') throw createError({ statusCode: 405, message: 'Method not allowed' })
    const modelId = getRouterParam(event, 'modelId')
    const entryId = getRouterParam(event, 'entryId')
    const raw = await readBody(event)
    const body = parseOrThrow(ContentFixBodySchema, raw)
    const result = await callTool('contentrain_content_save', {
      model: modelId,
      entries: [{ id: entryId, locale: body.locale, data: body.data }],
    }) as Record<string, unknown>

    broadcast({ type: 'validation:updated' })

    const git = result?.git as Record<string, unknown> | undefined
    if (git?.branch && git?.action === 'pending-review') {
      broadcast({ type: 'branch:created', branch: git.branch })
    }

    return result
  }))

  // Validate
  router.add('/api/validate', defineEventHandler(async (event) => {
    const query = getQuery(event)
    return await callTool('contentrain_validate', {
      model: query['model'] as string | undefined,
      fix: query['fix'] === 'true',
    })
  }))

  // Branches
  router.add('/api/branches', defineEventHandler(async () => {
    const git = simpleGit(projectRoot)
    const branches = await git.branchLocal()
    const crBranches = branches.all
      .filter(b => b.startsWith('cr/'))
      .map(b => ({
        name: b,
        current: b === branches.current,
        system: b === CONTENTRAIN_BRANCH,
      }))
    // Feature branches (exclude system contentrain branch) for the count
    const featureBranches = crBranches.filter(b => !b.system)
    return { branches: crBranches, total: featureBranches.length }
  }))

  // Branch diff
  //
  // Delegates to the MCP `branchDiff` helper so the base is the
  // `contentrain` content-tracking branch, not the repository's
  // default branch. When `contentrain` is ahead of `main`, the old
  // diff-against-default path surfaced unrelated historical content
  // changes as if they belonged to the feature branch under review.
  router.add('/api/branches/diff', defineEventHandler(async (event) => {
    const query = getQuery(event)
    const branchName = query['name'] as string
    if (!branchName?.startsWith('cr/')) {
      throw createError({ statusCode: 400, message: 'Invalid branch name' })
    }
    const result = await branchDiff(projectRoot, { branch: branchName })
    return {
      branch: result.branch,
      base: result.base,
      stat: result.stat,
      diff: result.patch,
      filesChanged: result.filesChanged,
    }
  }))

  // Merge preview — answers "if I approve this branch right now, what
  // would happen?" without running the merge. Three signals:
  //   - `alreadyMerged` — the feature branch is already in
  //     CONTENTRAIN_BRANCH's history (approve would be a no-op)
  //   - `canFastForward` — CONTENTRAIN_BRANCH is an ancestor of the
  //     feature branch (approve will fast-forward cleanly)
  //   - `conflicts` — best-effort list of conflicting paths detected
  //     via `git merge-tree`. Empty array when the check succeeds
  //     with no conflicts; `null` when the check couldn't run (older
  //     git, detached refs, etc.).
  //
  // Intentionally does NOT run the real merge — the approve route
  // already surfaces runtime conflicts by throwing. This is a fast,
  // side-effect-free signal for the UI to render a "preview" banner
  // before the user commits to approve.
  router.add('/api/preview/merge', defineEventHandler(async (event) => {
    const query = getQuery(event)
    const branchName = query['branch'] as string | undefined
    if (!branchName || !branchName.startsWith('cr/')) {
      throw createError({ statusCode: 400, message: 'Missing or invalid `branch` query (must start with "cr/")' })
    }

    const git = simpleGit(projectRoot)

    // Confirm the branch exists locally.
    const local = await git.branchLocal()
    if (!local.all.includes(branchName)) {
      throw createError({ statusCode: 404, message: `Branch "${branchName}" does not exist locally` })
    }

    // Fast-forward / already-merged checks.
    let alreadyMerged = false
    let canFastForward = false
    try {
      await git.raw(['merge-base', '--is-ancestor', branchName, CONTENTRAIN_BRANCH])
      alreadyMerged = true
    } catch { /* not merged yet */ }
    if (!alreadyMerged) {
      try {
        await git.raw(['merge-base', '--is-ancestor', CONTENTRAIN_BRANCH, branchName])
        canFastForward = true
      } catch { /* would require a 3-way merge */ }
    }

    // Best-effort conflict scan via `git merge-tree`. The legacy 3-way
    // form (`merge-tree <base> <ours> <theirs>`) is widely supported
    // and prints conflict sections on stdout; silence = clean.
    let conflicts: string[] | null = null
    try {
      const mergeBase = (await git.raw(['merge-base', CONTENTRAIN_BRANCH, branchName])).trim()
      if (mergeBase) {
        const out = await git.raw(['merge-tree', mergeBase, CONTENTRAIN_BRANCH, branchName])
        // Conflict sections look like `changed in both\n  base   100644 <sha> <path>...`
        // — extract unique paths from the `<<<<<<<` / `>>>>>>>` surrounds.
        const paths = new Set<string>()
        const conflictBlockRegex = /^(?:changed in both|added in both|removed in (?:local|remote))\b[^\n]*\n((?:[ \t][^\n]*\n)+)/gmu
        let match: RegExpExecArray | null
        while ((match = conflictBlockRegex.exec(out)) !== null) {
          const block = match[1] ?? ''
          const pathMatch = /\b100644\s+[0-9a-f]{4,}\s+(\S+)/u.exec(block)
          if (pathMatch?.[1]) paths.add(pathMatch[1])
        }
        conflicts = [...paths]
      }
    } catch { /* merge-tree unavailable or failed — leave as null */ }

    // Diff summary against CONTENTRAIN_BRANCH (the same base the
    // actual merge will use). Skip when already merged — the diff is
    // empty and the MCP helper would error on a zero-commit range.
    let stat = ''
    let filesChanged = 0
    if (!alreadyMerged) {
      try {
        const diff = await branchDiff(projectRoot, { branch: branchName })
        stat = diff.stat
        filesChanged = diff.filesChanged
      } catch { /* leave zeroed */ }
    }

    return {
      branch: branchName,
      base: CONTENTRAIN_BRANCH,
      alreadyMerged,
      canFastForward,
      conflicts,
      filesChanged,
      stat,
    }
  }))

  // Branch approve — delegates to MCP's mergeBranch helper, which
  // runs the worktree transaction + selective sync with dirty-file
  // protection. `sync.skipped[]` surfaces files that the developer
  // has uncommitted changes in; the UI shows those as a warning so
  // the user can resolve them manually.
  router.add('/api/branches/approve', defineEventHandler(async (event) => {
    if (event.method !== 'POST') throw createError({ statusCode: 405, message: 'Method not allowed' })
    const raw = await readBody(event)
    const { branch: branchName } = parseOrThrow(BranchActionBodySchema, raw)

    try {
      const result = await mergeBranch(projectRoot, branchName)
      // Cache the sync warnings so the UI can fetch them via
      // /api/branches/:name/sync-status without replaying the merge.
      if (result.sync?.skipped?.length) {
        syncWarnings.set(branchName, {
          branch: branchName,
          skipped: result.sync.skipped,
          synced: result.sync.synced,
          recordedAt: Date.now(),
        })
        broadcast({
          type: 'sync:warning',
          branch: branchName,
          skippedCount: result.sync.skipped.length,
        })
      }
      broadcast({ type: 'branch:merged', branch: branchName })
      return {
        status: 'merged',
        branch: branchName,
        commit: result.commit,
        action: result.action,
        sync: result.sync,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      broadcast({ type: 'branch:merge-conflict', branch: branchName, message })
      throw createError({ statusCode: 409, message: `Merge failed: ${message}` })
    }
  }))

  // Branch reject (delete)
  router.add('/api/branches/reject', defineEventHandler(async (event) => {
    if (event.method !== 'POST') throw createError({ statusCode: 405, message: 'Method not allowed' })
    const raw = await readBody(event)
    const { branch: branchName } = parseOrThrow(BranchActionBodySchema, raw)
    const git = simpleGit(projectRoot)
    await git.deleteLocalBranch(branchName, true)
    syncWarnings.delete(branchName)
    broadcast({ type: 'branch:rejected', branch: branchName })
    return { status: 'deleted', branch: branchName }
  }))

  // History — git log for contentrain operations
  router.add('/api/history', defineEventHandler(async (event) => {
    const query = getQuery(event)
    const limit = Number(query['limit']) || 50
    const git = simpleGit(projectRoot)
    const log = await git.log({
      maxCount: limit * 2, // fetch more, filter after
      format: { hash: '%h', fullHash: '%H', message: '%s', author: '%an', email: '%ae', date: '%aI', relativeDate: '%ar' },
    })
    // Filter to Contentrain-related commits. Tolerant of BOTH the
    // current `cr/*` branch naming and the legacy `contentrain/*`
    // format (auto-merged commits produced by git before Phase 7 of
    // the MCP refactor). Commit message body prefix `[contentrain]`
    // is still current — it's just the human-readable tag.
    const mergeBranchPattern = /^Merge branch '(cr\/|contentrain\/)/u
    const entries = log.all
      .filter((c) => {
        const msg = c.message ?? ''
        return msg.startsWith('[contentrain]') || mergeBranchPattern.test(msg)
      })
      .slice(0, limit)
      .map((c) => {
        const msg = c.message ?? ''
        let type: string = 'other'
        let target = ''
        if (msg.startsWith('[contentrain] created:')) {
          type = 'model_create'
          target = msg.replace('[contentrain] created: ', '')
        } else if (msg.startsWith('[contentrain] updated:')) {
          type = 'model_update'
          target = msg.replace('[contentrain] updated: ', '')
        } else if (msg.startsWith('[contentrain] content:')) {
          type = 'content_save'
          target = msg.replace('[contentrain] content: ', '')
        } else if (msg.startsWith('[contentrain] deleted:') || msg.startsWith('[contentrain] delete')) {
          type = 'delete'
          target = msg.replace(/^\[contentrain\] delete(?:d)?:?\s*/u, '')
        } else if (msg.startsWith('[contentrain] update context')) {
          type = 'context_update'
        } else if (mergeBranchPattern.test(msg)) {
          type = 'merge'
          target = msg.replace(/^Merge branch '/u, '').replace(/'$/u, '')
        } else if (msg.startsWith('[contentrain]')) {
          type = 'operation'
          target = msg.replace('[contentrain] ', '')
        }
        return { hash: c.hash, message: msg, type, target, author: c.author, date: c.date, relativeDate: c.relativeDate }
      })
    return { entries, total: entries.length }
  }))

  // Context
  router.add('/api/context', defineEventHandler(async () => {
    const contextPath = join(crDir, 'context.json')
    if (!existsSync(contextPath)) return { lastOperation: null, stats: null }
    const raw = await readFile(contextPath, 'utf-8')
    return JSON.parse(raw)
  }))

  // File tree — scannable project structure
  router.add('/api/tree', defineEventHandler(async (event) => {
    const query = getQuery(event)
    const extensions = (query['ext'] as string ?? '.vue,.tsx,.jsx,.ts,.js,.astro,.svelte').split(',')
    const { readdirSync } = await import('node:fs')

    interface TreeNode { name: string; path: string; type: 'dir' | 'file'; children?: TreeNode[]; fileCount?: number }

    const ignoreDirs = new Set(['node_modules', '.git', 'dist', '.tmp', '.agents', '.contentrain', '.cache', '.claude', '.histoire', 'serve-ui'])

    function buildTree(dirPath: string, relativePath: string, depth: number): TreeNode | null {
      if (depth > 5) return null
      const name = relativePath.split('/').pop() ?? relativePath
      if (ignoreDirs.has(name)) return null

      try {
        const entries = readdirSync(dirPath, { withFileTypes: true })
        const children: TreeNode[] = []
        let fileCount = 0

        for (const entry of entries) {
          if (entry.name.startsWith('.') && depth > 0) continue
          const childRelative = relativePath ? `${relativePath}/${entry.name}` : entry.name
          const childFull = join(dirPath, entry.name)

          if (entry.isDirectory()) {
            const sub = buildTree(childFull, childRelative, depth + 1)
            if (sub && (sub.fileCount ?? 0) > 0) children.push(sub)
          } else if (entry.isFile()) {
            const ext = '.' + entry.name.split('.').pop()
            if (extensions.includes(ext)) {
              children.push({ name: entry.name, path: childRelative, type: 'file' })
              fileCount++
            }
          }
        }

        // Sum file counts from children
        for (const child of children) {
          if (child.type === 'dir') fileCount += child.fileCount ?? 0
        }

        if (fileCount === 0) return null

        return { name, path: relativePath || '.', type: 'dir', children: children.toSorted((a, b) => {
          if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
          return a.name.localeCompare(b.name)
        }), fileCount }
      } catch { return null }
    }

    const tree = buildTree(projectRoot, '', 0)
    return { tree: tree?.children ?? [] }
  }))

  // Normalize — scan for hardcoded strings
  router.add('/api/normalize/scan', defineEventHandler(async (event) => {
    const query = getQuery(event)
    const mode = (query['mode'] as string) ?? 'summary'
    const limit = Number(query['limit']) || 30
    const offset = Number(query['offset']) || 0
    const paths = query['paths'] ? (query['paths'] as string).split(',') : undefined
    return await callTool('contentrain_scan', {
      mode,
      limit,
      offset,
      ...(paths ? { paths } : {}),
    })
  }))

  // Normalize — last results (from context.json + pending normalize branches)
  router.add('/api/normalize/results', defineEventHandler(async () => {
    let lastNormalize: unknown = null
    try {
      const raw = readFileSync(join(crDir, 'context.json'), 'utf-8')
      const ctx = JSON.parse(raw)
      const op = ctx?.lastOperation
      if (op?.tool === 'contentrain_scan' || op?.tool === 'contentrain_apply') {
        lastNormalize = op
      }
    } catch { /* no context */ }

    const git = simpleGit(projectRoot)
    const branches = (await git.branchLocal()).all
      .filter(b => b.startsWith('cr/normalize/'))
      .map(b => ({ name: b }))

    return { lastOperation: lastNormalize, pendingBranches: branches }
  }))

  // Normalize — read plan (normalize-plan.json)
  router.add('/api/normalize/plan', defineEventHandler(async () => {
    const planPath = join(crDir, 'normalize-plan.json')
    if (!existsSync(planPath)) return { plan: null }
    try {
      const raw = await readFile(planPath, 'utf-8')
      return { plan: JSON.parse(raw) }
    } catch {
      return { plan: null }
    }
  }))

  // Normalize — delete plan (reject)
  router.add('/api/normalize/plan/reject', defineEventHandler(async (event) => {
    if (event.method !== 'DELETE' && event.method !== 'POST') {
      throw createError({ statusCode: 405, message: 'Method not allowed' })
    }
    // Validate the (optional) body so future callers that want to
    // record a rejection reason have a well-defined contract, and so
    // every write route here parses through the same Zod gate.
    if (event.method === 'POST') {
      const raw = await readBody(event).catch(() => undefined)
      if (raw !== undefined) parseOrThrow(NormalizePlanRejectBodySchema, raw)
    }
    const planPath = join(crDir, 'normalize-plan.json')
    if (existsSync(planPath)) {
      await unlink(planPath)
    }
    broadcast({ type: 'normalize:plan-updated' })
    return { status: 'rejected' }
  }))

  // Normalize — approve plan (write approved status, call MCP apply)
  router.add('/api/normalize/plan/approve', defineEventHandler(async (event) => {
    if (event.method !== 'POST') throw createError({ statusCode: 405, message: 'Method not allowed' })
    const planPath = join(crDir, 'normalize-plan.json')
    if (!existsSync(planPath)) {
      throw createError({ statusCode: 404, message: 'No normalize plan found' })
    }
    const rawPlan = await readFile(planPath, 'utf-8')
    const plan = JSON.parse(rawPlan)
    const rawBody = await readBody(event)
    const body = parseOrThrow(NormalizePlanApproveBodySchema, rawBody)
    const selectedModels = body.models

    // Update plan status
    plan.status = 'approved'
    plan.approved_at = new Date().toISOString()
    if (selectedModels) {
      plan.approved_models = selectedModels
    }
    await writeFile(planPath, JSON.stringify(plan, null, 2) + '\n', 'utf-8')

    // Transform flat plan extractions into contentrain_apply grouped format
    const modelIds = selectedModels ?? plan.models?.map((m: { id: string }) => m.id) ?? []
    const modelMap = new Map<string, { id: string; kind: string; domain: string; i18n?: boolean; fields: Record<string, unknown> }>(
      (plan.models ?? []).map((m: { id: string; kind: string; domain: string; i18n?: boolean; fields: Record<string, unknown> }) => [m.id, m]),
    )

    // Group extractions by model
    const groupedByModel = new Map<string, Array<{ locale?: string; data: Record<string, string>; source: { file: string; line: number; value: string } }>>()
    for (const ext of (plan.extractions ?? []) as Array<{ value: string; file: string; line: number; model: string; field: string; locale?: string }>) {
      if (!modelIds.includes(ext.model)) continue
      const entries = groupedByModel.get(ext.model) ?? []
      entries.push({
        locale: ext.locale,
        data: { [ext.field]: ext.value },
        source: { file: ext.file, line: ext.line, value: ext.value },
      })
      groupedByModel.set(ext.model, entries)
    }

    // Build extractions array for contentrain_apply
    const applyExtractions = []
    for (const [modelId, entries] of groupedByModel) {
      const model = modelMap.get(modelId)
      applyExtractions.push({
        model: modelId,
        kind: model?.kind ?? 'collection',
        domain: model?.domain ?? 'default',
        i18n: model?.i18n,
        fields: model?.fields,
        entries,
      })
    }

    const applyArgs: Record<string, unknown> = {
      mode: 'extract',
      dry_run: false,
      extractions: applyExtractions,
    }
    const result = await callTool('contentrain_apply', applyArgs) as Record<string, unknown>

    // Clean up plan file after successful apply
    if (existsSync(planPath)) {
      await unlink(planPath)
    }

    // Surface the git metadata the same way /api/content/:modelId/:entryId/fix
    // does — so the BranchesPage picks up the new normalize branch
    // without a manual refresh.
    const git = result?.['git'] as Record<string, unknown> | undefined
    if (git?.['branch'] && git?.['action'] === 'pending-review') {
      broadcast({ type: 'branch:created', branch: String(git['branch']) })
    }

    broadcast({ type: 'normalize:plan-updated' })
    return result
  }))

  // Normalize — apply extraction (dry-run by default)
  router.add('/api/normalize/apply', defineEventHandler(async (event) => {
    if (event.method !== 'POST') throw createError({ statusCode: 405, message: 'Method not allowed' })
    const raw = await readBody(event)
    const body = parseOrThrow(NormalizeApplyBodySchema, raw)
    return await callTool('contentrain_apply', body as Record<string, unknown>)
  }))

  // Normalize — approve branch. Same invariants as /api/branches/approve:
  // delegate to MCP's mergeBranch, surface sync.skipped warnings,
  // broadcast merge-conflict on failure.
  router.add('/api/normalize/approve', defineEventHandler(async (event) => {
    if (event.method !== 'POST') throw createError({ statusCode: 405, message: 'Method not allowed' })
    const raw = await readBody(event)
    const { branch: branchName } = parseOrThrow(BranchActionBodySchema, raw)

    try {
      const result = await mergeBranch(projectRoot, branchName)
      if (result.sync?.skipped?.length) {
        syncWarnings.set(branchName, {
          branch: branchName,
          skipped: result.sync.skipped,
          synced: result.sync.synced,
          recordedAt: Date.now(),
        })
        broadcast({
          type: 'sync:warning',
          branch: branchName,
          skippedCount: result.sync.skipped.length,
        })
      }

      broadcast({ type: 'branch:merged', branch: branchName })
      return {
        status: 'merged',
        branch: branchName,
        commit: result.commit,
        action: result.action,
        sync: result.sync,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      broadcast({ type: 'branch:merge-conflict', branch: branchName, message })
      throw createError({ statusCode: 409, message: `Merge failed: ${message}` })
    }
  }))

  // Normalize — read source map (normalize-sources.json)
  router.add('/api/normalize/sources', defineEventHandler(async () => {
    const sourcesPath = join(crDir, 'normalize-sources.json')
    if (!existsSync(sourcesPath)) return { sources: null }
    try {
      const raw = await readFile(sourcesPath, 'utf-8')
      return { sources: JSON.parse(raw) }
    } catch {
      return { sources: null }
    }
  }))

  // Normalize — read file context around a line
  router.add('/api/normalize/file-context', defineEventHandler(async (event) => {
    const query = getQuery(event)
    const { file: filePath, line = 1, range = 5 } = parseOrThrow(FileContextQuerySchema, query, 'query')

    // Defense-in-depth beyond the Zod schema: resolve the full path
    // and assert it stays inside projectRoot. Catches clever encoded
    // escapes the regex might miss on quirky filesystems.
    const fullPath = join(projectRoot, filePath)
    const { resolve: resolvePath, sep } = await import('node:path')
    const resolvedRoot = resolvePath(projectRoot)
    const resolvedFull = resolvePath(fullPath)
    if (!resolvedFull.startsWith(resolvedRoot + sep) && resolvedFull !== resolvedRoot) {
      throw createError({ statusCode: 400, message: 'Path escapes project root' })
    }
    if (!existsSync(fullPath)) {
      throw createError({ statusCode: 404, message: 'File not found' })
    }

    const fileContent = await readFile(fullPath, 'utf-8')
    const allLines = fileContent.split('\n')
    const startLine = Math.max(1, line - range)
    const endLine = Math.min(allLines.length, line + range)

    const lines = []
    for (let i = startLine; i <= endLine; i++) {
      lines.push({ num: i, content: allLines[i - 1] ?? '' })
    }

    return { file: filePath, lines, highlight: line, totalLines: allLines.length }
  }))

  // --- Static UI serving ---
  const MIME_TYPES: Record<string, string> = {
    html: 'text/html', js: 'application/javascript', css: 'text/css',
    json: 'application/json', svg: 'image/svg+xml', png: 'image/png',
    jpg: 'image/jpeg', ico: 'image/x-icon', woff2: 'font/woff2',
    woff: 'font/woff', ttf: 'font/ttf',
  }

  function getMimeType(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase()
    return MIME_TYPES[ext ?? ''] ?? 'application/octet-stream'
  }

  if (existsSync(uiDir)) {
    const { statSync } = await import('node:fs')

    app.use(defineEventHandler(async (event) => {
      // Let API and WS routes pass through
      if (event.path.startsWith('/api/') || event.path === '/ws') return

      // Resolve file path
      let filePath = join(uiDir, event.path === '/' ? 'index.html' : event.path)

      // Check if file exists and is not a directory
      if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
        // SPA fallback — serve index.html for client-side routes
        filePath = join(uiDir, 'index.html')
      }

      const content = await readFile(filePath)
      event.node.res.setHeader('Content-Type', getMimeType(filePath))
      event.node.res.setHeader('Content-Length', content.length)
      return content
    }))
  }

  app.use(router)

  return { app, handleUpgrade, toNodeListener: () => toNodeListener(app) }
}
