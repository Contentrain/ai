import { defineCommand } from 'citty'
import { createServer } from '@contentrain/mcp/server'
import { resolveProjectRoot } from '../utils/context.js'
import consola from 'consola'

export default defineCommand({
  meta: {
    name: 'serve',
    description: 'Start local content viewer or MCP stdio server',
  },
  args: {
    root: { type: 'string', description: 'Project root path (env: CONTENTRAIN_PROJECT_ROOT)', required: false },
    stdio: { type: 'boolean', description: 'Use stdio MCP transport for IDE integration (env: CONTENTRAIN_STDIO=true)', required: false },
    mcpHttp: { type: 'boolean', description: 'Use HTTP MCP transport (serves tool calls at POST /mcp)', required: false },
    authToken: { type: 'string', description: 'Bearer token required for HTTP MCP requests (env: CONTENTRAIN_AUTH_TOKEN)', required: false },
    port: { type: 'string', description: 'HTTP server port, default: 3333 (env: CONTENTRAIN_PORT)', required: false },
    open: { type: 'boolean', description: 'Open browser automatically (env: CONTENTRAIN_NO_OPEN=true to disable)', required: false },
    host: { type: 'string', description: 'Bind address, default: localhost (env: CONTENTRAIN_HOST)', required: false },
    demo: { type: 'boolean', description: 'Start with a temporary demo project (no setup needed)', required: false },
  },
  async run({ args }) {
    let projectRoot = await resolveProjectRoot(args.root)

    // --- Demo mode: create temporary project ---
    let demoDir: string | undefined
    if (args.demo) {
      const { createDemoProject, cleanupDemoProject } = await import('../utils/demo.js')
      demoDir = await createDemoProject()
      projectRoot = demoDir
      consola.info(`Demo project created at ${demoDir}`)
      process.on('exit', () => { cleanupDemoProject(demoDir!) })
      process.on('SIGINT', () => { cleanupDemoProject(demoDir!); process.exit(0) })
    }

    // Set environment for MCP context tracking
    process.env['CONTENTRAIN_PROJECT_ROOT'] = projectRoot
    process.env['CONTENTRAIN_SOURCE'] = 'mcp-local'

    // Propagate git author info
    try {
      const { simpleGit } = await import('simple-git')
      const git = simpleGit(projectRoot)
      const config = await git.listConfig()
      const name = config.all['user.name']
      const email = config.all['user.email']
      if (name && typeof name === 'string') process.env['CONTENTRAIN_AUTHOR_NAME'] = name
      if (email && typeof email === 'string') process.env['CONTENTRAIN_AUTHOR_EMAIL'] = email
    } catch {
      // Use defaults
    }

    // --- Stdio mode (IDE integration) ---
    const useStdio = args.stdio || process.env['CONTENTRAIN_STDIO'] === 'true' || process.env['CONTENTRAIN_STDIO'] === '1'
    if (useStdio) {
      const server = createServer(projectRoot)
      const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js')
      const transport = new StdioServerTransport()
      consola.info(`Contentrain MCP server starting (stdio) — ${projectRoot}`)
      await server.connect(transport)
      return
    }

    const port = Number(args.port) || Number(process.env['CONTENTRAIN_PORT']) || 3333
    const host = args.host ?? process.env['CONTENTRAIN_HOST'] ?? 'localhost'

    // --- MCP over HTTP mode ---
    const useMcpHttp = args.mcpHttp || process.env['CONTENTRAIN_MCP_HTTP'] === 'true' || process.env['CONTENTRAIN_MCP_HTTP'] === '1'
    if (useMcpHttp) {
      const { startHttpMcpServer } = await import('@contentrain/mcp/server/http')
      const authToken = args.authToken ?? process.env['CONTENTRAIN_AUTH_TOKEN']
      const handle = await startHttpMcpServer({
        projectRoot,
        host,
        port,
        authToken,
      })
      consola.box({
        title: 'Contentrain MCP (HTTP)',
        message: [
          `Endpoint: ${handle.url}`,
          `Root:     ${projectRoot}`,
          authToken ? 'Auth:     Bearer token required' : 'Auth:     none (local-only server)',
          '',
          'Press Ctrl+C to stop',
        ].join('\n'),
      })
      if (host === '0.0.0.0' && !authToken) {
        consola.warn('HTTP MCP server is accessible from the network with no Bearer token. Set --auth-token or CONTENTRAIN_AUTH_TOKEN.')
      }
      process.on('SIGINT', () => { void handle.close().finally(() => process.exit(0)) })
      process.on('SIGTERM', () => { void handle.close().finally(() => process.exit(0)) })
      return
    }

    // --- Web UI mode (default) ---
    const shouldOpen = args.open !== false && process.env['CONTENTRAIN_NO_OPEN'] !== 'true'

    // Resolve UI directory (pre-built static assets next to CLI bundle)
    const { join, dirname } = await import('node:path')
    const { existsSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')

    // import.meta.url points to the chunk file in dist/ (e.g. dist/serve-XXX.mjs)
    const thisFile = fileURLToPath(import.meta.url)
    const distDir = dirname(thisFile)
    const uiDir = join(distDir, 'serve-ui')

    if (!existsSync(uiDir)) {
      consola.warn('Serve UI not found. Running in API-only mode.')
      consola.info('UI will be available after building: cd packages/cli/src/serve-ui && pnpm build')
    }

    const { createServeApp } = await import('../serve/server.js')
    const { app, handleUpgrade } = await createServeApp({ projectRoot, port, uiDir })

    // Start HTTP server
    const { createServer: createHttpServer } = await import('node:http')
    const { toNodeListener } = await import('h3')

    const h3Listener = toNodeListener(app)
    const httpServer = createHttpServer((req, res) => {
      // Skip /ws requests — they'll be handled by the upgrade event
      if (req.url === '/ws') {
        // Don't respond — let the upgrade event handle it
        // If not an upgrade, just close
        if (!req.headers.upgrade) {
          res.writeHead(400)
          res.end('WebSocket upgrade required')
        }
        return
      }
      h3Listener(req, res)
    })

    // WebSocket upgrade handler
    httpServer.on('upgrade', (req, socket, head) => {
      handleUpgrade(req, socket, head)
    })

    httpServer.listen(port, host, () => {
      const url = `http://${host}:${port}`
      consola.box({
        title: 'Contentrain Serve',
        message: [
          `Local:    ${url}`,
          `Watching: .contentrain/`,
          `Root:     ${projectRoot}`,
          '',
          'Press Ctrl+C to stop',
        ].join('\n'),
      })

      if (shouldOpen) {
        import('node:child_process').then(({ exec }) => {
          const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
          exec(`${cmd} ${url}`)
        })
      }
    })

    // Warn if binding to 0.0.0.0
    if (host === '0.0.0.0') {
      consola.warn('Server is accessible from the network. No authentication is configured.')
    }
  },
})
