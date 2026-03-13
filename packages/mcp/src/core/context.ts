import type { ContextJson, ContextSource } from '@contentrain/types'
import { join } from 'node:path'
import { contentrainDir, readJson, writeJson } from '../util/fs.js'
import { listModels, readModel, countEntries } from './model-manager.js'
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

  // Calculate real entry count across all models
  let totalEntries: number | null = null
  try {
    let count = 0
    const fullModels = await Promise.all(
      models.map(m => readModel(projectRoot, m.id)),
    )
    const counts = await Promise.all(
      fullModels
        .filter((m): m is NonNullable<typeof m> => m !== null)
        .map(m => countEntries(projectRoot, m)),
    )
    for (const c of counts) {
      count += c.total
    }
    totalEntries = count
  } catch {
    // If counting fails, signal unknown rather than zero
    totalEntries = null
  }

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
      entries: totalEntries as number,
      locales,
      lastSync: new Date().toISOString(),
    },
  }

  await writeJson(join(contentrainDir(projectRoot), 'context.json'), context)
}
