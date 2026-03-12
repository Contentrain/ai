import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerContextTools } from './tools/context.js'
import { registerSetupTools } from './tools/setup.js'
import { registerModelTools } from './tools/model.js'

export function createServer(projectRoot: string): McpServer {
  const server = new McpServer({
    name: 'contentrain-mcp',
    version: '0.0.0',
  })

  registerContextTools(server, projectRoot)
  registerSetupTools(server, projectRoot)
  registerModelTools(server, projectRoot)

  return server
}
