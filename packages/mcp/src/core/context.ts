import type { ContextJson, ContextSource } from '@contentrain/types'
import { join } from 'node:path'
import { contentrainDir, readJson, writeJson } from '../util/fs.js'
import { listModels } from './model-manager.js'
import { readConfig } from './config.js'

export async function readContext(projectRoot: string): Promise<ContextJson | null> {
  return readJson<ContextJson>(join(contentrainDir(projectRoot), 'context.json'))
}

export async function writeContext(
  projectRoot: string,
  operation: { tool: string; model: string; locale?: string; entries?: string[] },
): Promise<void> {
  const models = await listModels(projectRoot)
  const config = await readConfig(projectRoot)
  const locales = config?.locales.supported ?? ['en']

  const source: ContextSource = process.env['CONTENTRAIN_SOURCE'] === 'mcp-studio'
    ? 'mcp-studio'
    : 'mcp-local'

  const context: ContextJson = {
    version: '1',
    lastOperation: {
      tool: operation.tool,
      model: operation.model,
      locale: operation.locale ?? config?.locales.default ?? 'en',
      entries: operation.entries,
      timestamp: new Date().toISOString(),
      source,
    },
    stats: {
      models: models.length,
      entries: 0,
      locales,
      lastSync: new Date().toISOString(),
    },
  }

  await writeJson(join(contentrainDir(projectRoot), 'context.json'), context)
}
