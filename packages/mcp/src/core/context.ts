import type { ContextJson, ContextSource } from '@contentrain/types'
import { join } from 'node:path'
import { contentrainDir, readJson, writeJson } from '../util/fs.js'
import type { FileChange, RepoReader } from './contracts/index.js'
import { canonicalStringify } from './serialization/index.js'
import { listModels, readModel, countEntries } from './model-manager.js'
import { readConfig } from './config.js'

const CONTEXT_PATH = '.contentrain/context.json'

export async function readContext(projectRoot: string): Promise<ContextJson | null> {
  return readJson<ContextJson>(join(contentrainDir(projectRoot), 'context.json'))
}

function resolveSource(explicit?: ContextSource): ContextSource {
  if (explicit) return explicit
  return process.env['CONTENTRAIN_SOURCE'] === 'mcp-studio' ? 'mcp-studio' : 'mcp-local'
}

async function computeEntriesCount(projectRoot: string): Promise<number | null> {
  try {
    const models = await listModels(projectRoot)
    const fullModels = await Promise.all(models.map(m => readModel(projectRoot, m.id)))
    const counts = await Promise.all(
      fullModels
        .filter((m): m is NonNullable<typeof m> => m !== null)
        .map(m => countEntries(projectRoot, m)),
    )
    return counts.reduce((acc, c) => acc + c.total, 0)
  } catch {
    return null
  }
}

export async function writeContext(
  projectRoot: string,
  operation: { tool: string, model: string, locale?: string, entries?: string[] },
): Promise<void> {
  const models = await listModels(projectRoot)
  const config = await readConfig(projectRoot)
  const locales = config?.locales.supported ?? ['en']
  const totalEntries = await computeEntriesCount(projectRoot)
  const source = resolveSource()

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

/**
 * Build a FileChange for `.contentrain/context.json` that remote providers
 * (GitHubProvider over HTTP, for example) can slot into their plan — the
 * local write path still uses {@link writeContext} directly because its
 * transaction layer computes entry counts against the post-apply worktree,
 * which is cheaper than re-walking the repo via the Git Data API.
 *
 * Entry count is left as the reader cannot enumerate directories cheaply
 * across every provider; the legacy writeContext path continues to supply
 * real counts for local flows.
 */
export async function buildContextChange(
  reader: RepoReader,
  operation: { tool: string, model: string, locale?: string, entries?: string[] },
  source?: ContextSource,
): Promise<FileChange> {
  const config = await readConfig(reader)
  const models = await listModels(reader)
  const locales = config?.locales.supported ?? ['en']

  const context: ContextJson = {
    version: '1',
    lastOperation: {
      tool: operation.tool,
      model: operation.model,
      locale: operation.locale ?? config?.locales.default ?? 'en',
      entries: operation.entries,
      timestamp: new Date().toISOString(),
      source: resolveSource(source),
    },
    stats: {
      models: models.length,
      entries: null as unknown as number,
      locales,
      lastSync: new Date().toISOString(),
    },
  }

  return {
    path: CONTEXT_PATH,
    content: canonicalStringify(context),
  }
}
