import { defineCommand } from 'citty'
import { createServer } from '@contentrain/mcp/server'
import { resolveProjectRoot } from '../utils/context.js'
import consola from 'consola'

export default defineCommand({
  meta: {
    name: 'serve',
    description: 'Start MCP server for IDE integration',
  },
  args: {
    root: { type: 'string', description: 'Project root path', required: false },
    stdio: { type: 'boolean', description: 'Use stdio transport (default)', required: false },
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

    const server = createServer(projectRoot)

    // Import stdio transport
    const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js')
    const transport = new StdioServerTransport()

    consola.info(`Contentrain MCP server starting (stdio) — ${projectRoot}`)
    await server.connect(transport)
  },
})
