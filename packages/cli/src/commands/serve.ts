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
    root: { type: 'string', description: 'Project root path', required: false },
    stdio: { type: 'boolean', description: 'Use stdio MCP transport (for IDE integration)', required: false },
    port: { type: 'string', description: 'HTTP server port (default: 3333)', required: false },
    open: { type: 'boolean', description: 'Open browser automatically', required: false },
    host: { type: 'string', description: 'Bind address (default: localhost)', required: false },
  },
  async run({ args }) {
    const projectRoot = await resolveProjectRoot(args.root)

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
    if (args.stdio) {
      const server = createServer(projectRoot)
      const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js')
      const transport = new StdioServerTransport()
      consola.info(`Contentrain MCP server starting (stdio) — ${projectRoot}`)
      await server.connect(transport)
      return
    }

    // --- Web UI mode (default) ---
    const port = Number(args.port) || 3333
    const host = args.host ?? 'localhost'
    const shouldOpen = args.open !== false

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
