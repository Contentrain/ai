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
import { join, resolve } from 'node:path'
import { existsSync } from 'node:fs'
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
    const textContent = result.content.find((c: { type: string }) => c.type === 'text')
    if (!textContent || !('text' in textContent)) {
      throw createError({ statusCode: 500, message: `Tool ${name} returned no text content` })
    }
    return JSON.parse(textContent.text as string)
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

    watcher.on('all', (eventType, filePath) => {
      const rel = filePath.replace(crDir, '').replace(/^\//, '')

      let event: Record<string, unknown>
      if (rel === 'config.json') {
        event = { type: 'config:changed' }
      } else if (rel === 'context.json') {
        event = { type: 'context:changed' }
      } else if (rel.startsWith('models/')) {
        const modelId = rel.replace('models/', '').replace('.json', '')
        event = { type: 'model:changed', modelId }
      } else if (rel.startsWith('content/')) {
        const parts = rel.replace('content/', '').split('/')
        event = { type: 'content:changed', modelId: parts[0], locale: parts[1]?.replace('.json', '') }
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
    return await callTool('contentrain_content_save', {
      model: modelId,
      entries: [{ id: entryId, locale: body.locale, data: body.data }],
    })
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

  // Branch diff
  router.add('/api/branches/diff', defineEventHandler(async (event) => {
    const query = getQuery(event)
    const branchName = query['name'] as string
    if (!branchName?.startsWith('contentrain/')) {
      throw createError({ statusCode: 400, message: 'Invalid branch name' })
    }
    const git = simpleGit(projectRoot)
    const defaultBranch = (await git.branchLocal()).current === branchName
      ? 'main'
      : (await git.branchLocal()).current
    const diff = await git.diff([`${defaultBranch}...${branchName}`, '--stat'])
    const rawDiff = await git.diff([`${defaultBranch}...${branchName}`])
    return { branch: branchName, base: defaultBranch, stat: diff, diff: rawDiff }
  }))

  // Branch approve (merge)
  router.add('/api/branches/approve', defineEventHandler(async (event) => {
    if (event.method !== 'POST') throw createError({ statusCode: 405, message: 'Method not allowed' })
    const body = await readBody(event)
    const branchName = body.branch as string
    if (!branchName?.startsWith('contentrain/')) {
      throw createError({ statusCode: 400, message: 'Invalid branch name' })
    }
    const git = simpleGit(projectRoot)
    const currentBranch = (await git.branchLocal()).current
    await git.merge([branchName])
    await git.deleteLocalBranch(branchName, true)
    broadcast({ type: 'branch:merged', branch: branchName })
    return { status: 'merged', branch: branchName, into: currentBranch }
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

  // Context
  router.add('/api/context', defineEventHandler(async () => {
    const contextPath = join(crDir, 'context.json')
    if (!existsSync(contextPath)) return { lastOperation: null, stats: null }
    const raw = await readFile(contextPath, 'utf-8')
    return JSON.parse(raw)
  }))

  // --- Static UI serving ---
  if (existsSync(uiDir)) {
    const { statSync } = await import('node:fs')
    const { lookup } = await import('node:dns').catch(() => ({ lookup: null }))

    function getMimeType(filePath: string): string {
      const ext = filePath.split('.').pop()?.toLowerCase()
      const mimes: Record<string, string> = {
        html: 'text/html', js: 'application/javascript', css: 'text/css',
        json: 'application/json', svg: 'image/svg+xml', png: 'image/png',
        jpg: 'image/jpeg', ico: 'image/x-icon', woff2: 'font/woff2',
        woff: 'font/woff', ttf: 'font/ttf',
      }
      return mimes[ext ?? ''] ?? 'application/octet-stream'
    }

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
