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
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { readFile, unlink, writeFile } from 'node:fs/promises'
import { simpleGit } from 'simple-git'
import { CONTENTRAIN_BRANCH } from '@contentrain/types'

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
      } else {
        return
      }

      pendingEvents.push(event)
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(flush, 300)
    })
  }

  // --- API Routes ---

  // Status
  router.add('/api/status', defineEventHandler(async () => {
    return await callTool('contentrain_status')
  }))

  // Describe model
  router.add('/api/describe/:modelId', defineEventHandler(async (event) => {
    const modelId = getRouterParam(event, 'modelId')
    return await callTool('contentrain_describe', { model: modelId, include_sample: true })
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
    const body = await readBody(event)
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
  router.add('/api/branches/diff', defineEventHandler(async (event) => {
    const query = getQuery(event)
    const branchName = query['name'] as string
    if (!branchName?.startsWith('cr/')) {
      throw createError({ statusCode: 400, message: 'Invalid branch name' })
    }
    const git = simpleGit(projectRoot)
    const defaultBranch = getDefaultBranch()
    const diff = await git.diff([`${defaultBranch}...${branchName}`, '--stat'])
    const rawDiff = await git.diff([`${defaultBranch}...${branchName}`])
    return { branch: branchName, base: defaultBranch, stat: diff, diff: rawDiff }
  }))

  // Branch approve (merge via contentrain worktree)
  router.add('/api/branches/approve', defineEventHandler(async (event) => {
    if (event.method !== 'POST') throw createError({ statusCode: 405, message: 'Method not allowed' })
    const body = await readBody(event)
    const branchName = body.branch as string
    if (!branchName?.startsWith('cr/')) {
      throw createError({ statusCode: 400, message: 'Invalid branch name' })
    }
    const git = simpleGit(projectRoot)
    const baseBranch = getDefaultBranch()

    // Ensure contentrain branch exists
    const localBranches = await git.branchLocal()
    if (!localBranches.all.includes(CONTENTRAIN_BRANCH)) {
      await git.branch([CONTENTRAIN_BRANCH, baseBranch])
    }

    // Create temp worktree on contentrain branch
    const mergePath = join(tmpdir(), `cr-merge-${randomUUID()}`)
    await git.raw(['worktree', 'add', mergePath, CONTENTRAIN_BRANCH])
    const mergeGit = simpleGit(mergePath)

    try {
      // Sync contentrain with base
      await mergeGit.merge([baseBranch, '--no-edit']).catch(() => {})

      // Merge selected branch into contentrain
      await mergeGit.merge([branchName, '--no-edit'])

      // Get contentrain tip
      const tip = (await mergeGit.raw(['rev-parse', 'HEAD'])).trim()

      // Advance base branch via update-ref
      await git.raw(['update-ref', `refs/heads/${baseBranch}`, tip])

      // Sync .contentrain/ files to developer's tree
      const currentBranch = (await git.raw(['branch', '--show-current'])).trim()
      if (currentBranch === baseBranch) {
        await git.checkout([tip, '--', '.contentrain/'])
      }

      // Delete the merged feature branch
      await git.deleteLocalBranch(branchName, true)

      broadcast({ type: 'branch:merged', branch: branchName })
      return { status: 'merged', branch: branchName, into: baseBranch }
    } finally {
      // Cleanup worktree
      await git.raw(['worktree', 'remove', mergePath, '--force']).catch(() => {})
    }
  }))

  // Branch reject (delete)
  router.add('/api/branches/reject', defineEventHandler(async (event) => {
    if (event.method !== 'POST') throw createError({ statusCode: 405, message: 'Method not allowed' })
    const body = await readBody(event)
    const branchName = body.branch as string
    if (!branchName?.startsWith('cr/')) {
      throw createError({ statusCode: 400, message: 'Invalid branch name' })
    }
    const git = simpleGit(projectRoot)
    await git.deleteLocalBranch(branchName, true)
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
    // Filter to contentrain-related commits
    const entries = log.all
      .filter((c) => {
        const msg = c.message ?? ''
        return msg.startsWith('[contentrain]') || msg.startsWith('Merge branch \'contentrain/') || msg.includes('contentrain')
      })
      .slice(0, limit)
      .map((c) => {
        const msg = c.message ?? ''
        let type: string = 'other'
        let target = ''
        // Parse commit message
        if (msg.startsWith('[contentrain] created:')) {
          type = 'model_create'
          target = msg.replace('[contentrain] created: ', '')
        } else if (msg.startsWith('[contentrain] updated:')) {
          type = 'model_update'
          target = msg.replace('[contentrain] updated: ', '')
        } else if (msg.startsWith('[contentrain] content:')) {
          type = 'content_save'
          target = msg.replace('[contentrain] content: ', '')
        } else if (msg.startsWith('[contentrain] deleted:')) {
          type = 'delete'
          target = msg.replace('[contentrain] deleted: ', '')
        } else if (msg.startsWith('[contentrain] update context')) {
          type = 'context_update'
        } else if (msg.startsWith('Merge branch \'contentrain/')) {
          type = 'merge'
          target = msg.replace("Merge branch '", '').replace("'", '')
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
    const raw = await readFile(planPath, 'utf-8')
    const plan = JSON.parse(raw)
    const body = await readBody(event)
    const selectedModels = body?.models as string[] | undefined

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
    const result = await callTool('contentrain_apply', applyArgs)

    // Clean up plan file after successful apply
    if (existsSync(planPath)) {
      await unlink(planPath)
    }

    broadcast({ type: 'normalize:plan-updated' })
    return result
  }))

  // Normalize — apply extraction (dry-run by default)
  router.add('/api/normalize/apply', defineEventHandler(async (event) => {
    if (event.method !== 'POST') throw createError({ statusCode: 405, message: 'Method not allowed' })
    const body = await readBody(event)
    return await callTool('contentrain_apply', body)
  }))

  // Normalize — approve branch (merge normalize branch via contentrain worktree)
  router.add('/api/normalize/approve', defineEventHandler(async (event) => {
    if (event.method !== 'POST') throw createError({ statusCode: 405, message: 'Method not allowed' })
    const body = await readBody(event)
    const branchName = body.branch as string
    if (!branchName?.startsWith('cr/')) {
      throw createError({ statusCode: 400, message: 'Invalid branch name' })
    }
    const git = simpleGit(projectRoot)
    const baseBranch = getDefaultBranch()

    // Ensure contentrain branch exists
    const localBranches = await git.branchLocal()
    if (!localBranches.all.includes(CONTENTRAIN_BRANCH)) {
      await git.branch([CONTENTRAIN_BRANCH, baseBranch])
    }

    // Create temp worktree on contentrain branch
    const mergePath = join(tmpdir(), `cr-merge-${randomUUID()}`)
    await git.raw(['worktree', 'add', mergePath, CONTENTRAIN_BRANCH])
    const mergeGit = simpleGit(mergePath)

    try {
      // Sync contentrain with base
      await mergeGit.merge([baseBranch, '--no-edit']).catch(() => {})

      // Merge normalize branch into contentrain
      await mergeGit.merge([branchName, '--no-edit'])

      // Get contentrain tip
      const tip = (await mergeGit.raw(['rev-parse', 'HEAD'])).trim()

      // Advance base branch via update-ref
      await git.raw(['update-ref', `refs/heads/${baseBranch}`, tip])

      // Sync .contentrain/ files to developer's tree
      const currentBranch = (await git.raw(['branch', '--show-current'])).trim()
      if (currentBranch === baseBranch) {
        await git.checkout([tip, '--', '.contentrain/'])
      }

      // Delete the merged normalize branch
      await git.deleteLocalBranch(branchName, true)

      broadcast({ type: 'branch:merged', branch: branchName })
      return { status: 'merged', branch: branchName, into: baseBranch }
    } finally {
      // Cleanup worktree
      await git.raw(['worktree', 'remove', mergePath, '--force']).catch(() => {})
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
    const filePath = query['file'] as string
    const line = Number(query['line']) || 1
    const range = Number(query['range']) || 5

    if (!filePath || filePath.includes('..') || filePath.startsWith('/')) {
      throw createError({ statusCode: 400, message: 'Invalid file path' })
    }

    const fullPath = join(projectRoot, filePath)
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
