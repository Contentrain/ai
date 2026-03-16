import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerContextTools } from './tools/context.js'
import { registerSetupTools } from './tools/setup.js'
import { registerModelTools } from './tools/model.js'
import { registerContentTools } from './tools/content.js'
import { registerWorkflowTools } from './tools/workflow.js'
import { registerNormalizeTools } from './tools/normalize.js'
import { registerBulkTools } from './tools/bulk.js'
import packageJson from '../package.json' with { type: 'json' }

export function createServer(projectRoot: string): McpServer {
  const server = new McpServer({
    name: 'contentrain-mcp',
    version: packageJson.version,
  })

  registerContextTools(server, projectRoot)
  registerSetupTools(server, projectRoot)
  registerModelTools(server, projectRoot)
  registerContentTools(server, projectRoot)
  registerWorkflowTools(server, projectRoot)
  registerNormalizeTools(server, projectRoot)
  registerBulkTools(server, projectRoot)

  return server
}
