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
import { readFile } from 'node:fs/promises'
import { simpleGit } from 'simple-git'

interface ServeOptions {
  projectRoot: string
  port: number
  uiDir: string
}

export async function createServeApp(options: ServeOptions) {
  const { projectRoot, uiDir } = options
  const crDir = join(projectRoot, '.contentrain')

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
    const textContent = contentArr.find(c => c.type === 'text')
    if (!textContent?.text) {
      throw createError({ statusCode: 500, message: `Tool ${name} returned no text content` })
    }
    return JSON.parse(textContent.text)
  }

  // --- H3 App ---
  const app = createApp()
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
        // Include context payload so consumers don't need extra fetch
        let context: unknown = null
        try {
          const raw = readFileSync(join(crDir, 'context.json'), 'utf-8')
          context = JSON.parse(raw)
        } catch { /* file may be mid-write */ }
        event = { type: 'context:changed', context }
      } else if (rel.startsWith('models/')) {
        const modelId = rel.replace('models/', '').replace('.json', '')
        event = { type: 'model:changed', modelId }
      } else if (rel.startsWith('content/')) {
        // Path: content/<domain>/<model>/<locale>.json
        const parts = rel.replace('content/', '').split('/')
        const modelId = parts.length >= 2 ? parts[1] : parts[0]
        const locale = parts.length >= 3 ? parts[2]?.replace('.json', '') : parts[1]?.replace('.json', '')
        event = { type: 'content:changed', modelId, locale }
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

  // Quick fix (content save) — broadcasts branch:created if review workflow creates a branch
  router.add('/api/content/:modelId/:entryId/fix', defineEventHandler(async (event) => {
    if (event.method !== 'POST') throw createError({ statusCode: 405, message: 'Method not allowed' })
    const modelId = getRouterParam(event, 'modelId')
    const entryId = getRouterParam(event, 'entryId')
    const body = await readBody(event)
    const result = await callTool('contentrain_content_save', {
      model: modelId,
      entries: [{ id: entryId, locale: body.locale, data: body.data }],
    }) as Record<string, unknown>
    // Content changed → validation may have changed
    broadcast({ type: 'validation:updated' })
    // If MCP created a branch (review workflow), broadcast it last
    const git = result.git as Record<string, unknown> | undefined
    if (git?.branch && typeof git.branch === 'string') {
      broadcast({ type: 'branch:created', branch: git.branch })
    }
    return result
  }))

  // Validate
  router.add('/api/validate', defineEventHandler(async (event) => {
    const query = getQuery(event)
    return await callTool('contentrain_validate', {
      model: query['model'] as string | undefined,
    })
  }))

  // Branches
  router.add('/api/branches', defineEventHandler(async () => {
    const git = simpleGit(projectRoot)
    const branches = await git.branchLocal()
    const crBranches = branches.all
      .filter(b => b.startsWith('contentrain/'))
      .map(b => ({ name: b, current: b === branches.current }))
    return { branches: crBranches, total: crBranches.length }
  }))

  // Resolve configured default branch from config.json
  function getDefaultBranch(): string {
    try {
      const raw = readFileSync(join(crDir, 'config.json'), 'utf-8')
      const config = JSON.parse(raw)
      return config?.repository?.default_branch ?? 'main'
    } catch { return 'main' }
  }

  // Branch diff
  router.add('/api/branches/diff', defineEventHandler(async (event) => {
    const query = getQuery(event)
    const branchName = query['name'] as string
    if (!branchName?.startsWith('contentrain/')) {
      throw createError({ statusCode: 400, message: 'Invalid branch name' })
    }
    const git = simpleGit(projectRoot)
    const baseBranch = getDefaultBranch()
    const diff = await git.diff([`${baseBranch}...${branchName}`, '--stat'])
    const rawDiff = await git.diff([`${baseBranch}...${branchName}`])
    return { branch: branchName, base: baseBranch, stat: diff, diff: rawDiff }
  }))

  // Branch approve (merge with conflict resolution)
  router.add('/api/branches/approve', defineEventHandler(async (event) => {
    if (event.method !== 'POST') throw createError({ statusCode: 405, message: 'Method not allowed' })
    const body = await readBody(event)
    const branchName = body.branch as string
    if (!branchName?.startsWith('contentrain/')) {
      throw createError({ statusCode: 400, message: 'Invalid branch name' })
    }
    const git = simpleGit(projectRoot)
    const baseBranch = getDefaultBranch()
    // Ensure we're on the configured base branch before merging
    await git.checkout(baseBranch)
    try {
      // Try merge with theirs strategy for .contentrain/ conflicts
      await git.merge([branchName, '--no-edit', '-X', 'theirs'])
    } catch {
      // If still conflicts, resolve manually
      try {
        await git.raw(['checkout', '--theirs', '--', '.contentrain/']).catch(() => {})
        await git.add('.')
        await git.commit(`Merge branch '${branchName}' (auto-resolved)`, { '--no-verify': null })
      } catch (resolveErr) {
        await git.merge(['--abort']).catch(() => {})
        throw createError({ statusCode: 500, message: `Merge conflict could not be resolved: ${resolveErr}` })
      }
    }
    await git.deleteLocalBranch(branchName, true).catch(() => {})
    broadcast({ type: 'branch:merged', branch: branchName })
    return { status: 'merged', branch: branchName, into: baseBranch }
  }))

  // Branch reject (delete)
  router.add('/api/branches/reject', defineEventHandler(async (event) => {
    if (event.method !== 'POST') throw createError({ statusCode: 405, message: 'Method not allowed' })
    const body = await readBody(event)
    const branchName = body.branch as string
    if (!branchName?.startsWith('contentrain/')) {
      throw createError({ statusCode: 400, message: 'Invalid branch name' })
    }
    const git = simpleGit(projectRoot)
    await git.deleteLocalBranch(branchName, true)
    return { status: 'deleted', branch: branchName }
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
    // Read last normalize operation from context
    let lastNormalize: unknown = null
    try {
      const raw = readFileSync(join(crDir, 'context.json'), 'utf-8')
      const ctx = JSON.parse(raw)
      const op = ctx?.lastOperation
      if (op?.tool === 'contentrain_scan' || op?.tool === 'contentrain_apply') {
        lastNormalize = op
      }
    } catch { /* no context */ }

    // Find pending normalize branches
    const git = simpleGit(projectRoot)
    const branches = (await git.branchLocal()).all
      .filter(b => b.startsWith('contentrain/normalize/'))
      .map(b => ({ name: b }))

    return { lastOperation: lastNormalize, pendingBranches: branches }
  }))

  // Normalize — apply extraction (dry-run by default)
  router.add('/api/normalize/apply', defineEventHandler(async (event) => {
    if (event.method !== 'POST') throw createError({ statusCode: 405, message: 'Method not allowed' })
    const body = await readBody(event)
    return await callTool('contentrain_apply', body)
  }))

  // Normalize — approve (merge normalize branch)
  router.add('/api/normalize/approve', defineEventHandler(async (event) => {
    if (event.method !== 'POST') throw createError({ statusCode: 405, message: 'Method not allowed' })
    const body = await readBody(event)
    const branchName = body.branch as string
    if (!branchName?.startsWith('contentrain/')) {
      throw createError({ statusCode: 400, message: 'Invalid branch name' })
    }
    const git = simpleGit(projectRoot)
    const baseBranch = getDefaultBranch()
    await git.checkout(baseBranch)
    try {
      await git.merge([branchName, '--no-edit', '-X', 'theirs'])
    } catch {
      try {
        await git.raw(['checkout', '--theirs', '--', '.contentrain/']).catch(() => {})
        await git.add('.')
        await git.commit(`Merge branch '${branchName}' (auto-resolved)`, { '--no-verify': null })
      } catch (resolveErr) {
        await git.merge(['--abort']).catch(() => {})
        throw createError({ statusCode: 500, message: `Merge conflict could not be resolved: ${resolveErr}` })
      }
    }
    await git.deleteLocalBranch(branchName, true).catch(() => {})
    broadcast({ type: 'branch:merged', branch: branchName })
    return { status: 'merged', branch: branchName, into: baseBranch }
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
    // Filter to contentrain OPERATIONS only (not repo development commits)
    const entries = log.all
      .filter((c) => {
        const msg = c.message ?? ''
        return msg.startsWith('[contentrain]') || msg.startsWith("Merge branch 'contentrain/")
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

  // --- Static UI serving ---

  const mimeTypes: Record<string, string> = {
    html: 'text/html', js: 'application/javascript', css: 'text/css',
    json: 'application/json', svg: 'image/svg+xml', png: 'image/png',
    jpg: 'image/jpeg', ico: 'image/x-icon', woff2: 'font/woff2',
    woff: 'font/woff', ttf: 'font/ttf',
  }

  function getMimeType(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase()
    return mimeTypes[ext ?? ''] ?? 'application/octet-stream'
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
