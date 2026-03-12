#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer } from './server.js'

const projectRoot = process.env['CONTENTRAIN_PROJECT_ROOT'] ?? process.cwd()
const server = createServer(projectRoot)
const transport = new StdioServerTransport()

await server.connect(transport)
