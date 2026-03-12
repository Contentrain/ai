import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerContextTools } from './tools/context.js'

export function createServer(projectRoot: string): McpServer {
  const server = new McpServer({
    name: 'contentrain-mcp',
    version: '0.0.0',
  })

  registerContextTools(server, projectRoot)

  return server
}
