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
 * (GitHubProvider over HTTP, for example) can slot into their plan. The
 * local write path still uses {@link writeContext} directly because its
 * transaction layer writes into the post-apply worktree with real stats.
 *
 * Remote providers (Phase 5.5+) now also get accurate entry counts: the
 * reader-based {@link countEntries} walks each model over the provider's
 * read surface. GitHubProvider pays an extra round trip per model; the
 * payoff is a context.json that matches what the local write path emits,
 * so cross-provider merges stay deterministic.
 */
export async function buildContextChange(
  reader: RepoReader,
  operation: { tool: string, model: string, locale?: string, entries?: string[] },
  source?: ContextSource,
): Promise<FileChange> {
  const config = await readConfig(reader)
  const models = await listModels(reader)
  const locales = config?.locales.supported ?? ['en']

  let totalEntries: number | null = null
  try {
    const fullModels = await Promise.all(models.map(m => readModel(reader, m.id)))
    const counts = await Promise.all(
      fullModels
        .filter((m): m is NonNullable<typeof m> => m !== null)
        .map(m => countEntries(reader, m)),
    )
    totalEntries = counts.reduce((acc, c) => acc + c.total, 0)
  } catch {
    totalEntries = null
  }

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
      entries: totalEntries as number,
      locales,
      lastSync: new Date().toISOString(),
    },
  }

  return {
    path: CONTEXT_PATH,
    content: canonicalStringify(context),
  }
}
