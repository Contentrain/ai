import type { ContentrainConfig, Vocabulary } from '@contentrain/types'
import { join } from 'node:path'
import { contentrainDir, readJson } from '../util/fs.js'
import type { RepoReader } from './contracts/index.js'

const CONFIG_PATH = '.contentrain/config.json'
const VOCABULARY_PATH = '.contentrain/vocabulary.json'

async function readJsonViaReader<T>(reader: RepoReader, path: string): Promise<T | null> {
  try {
    return JSON.parse(await reader.readFile(path)) as T
  } catch {
    return null
  }
}

function normaliseConfig(raw: Partial<ContentrainConfig> | null): ContentrainConfig | null {
  if (!raw) return null
  return {
    version: raw.version ?? 1,
    stack: raw.stack ?? 'other',
    workflow: raw.workflow ?? 'auto-merge',
    locales: {
      default: raw.locales?.default ?? 'en',
      supported: raw.locales?.supported ?? [raw.locales?.default ?? 'en'],
    },
    domains: raw.domains ?? [],
    repository: raw.repository,
    assets_path: raw.assets_path,
    branchRetention: raw.branchRetention,
  }
}

/**
 * Read `.contentrain/config.json` and normalise it with safe defaults.
 *
 * Accepts either a legacy `projectRoot` string (LocalReader is constructed
 * internally) or any `RepoReader` — tool handlers pass their provider so
 * the same logic resolves against local fs or the GitHub Git Data API.
 */
export function readConfig(projectRoot: string): Promise<ContentrainConfig | null>
export function readConfig(reader: RepoReader): Promise<ContentrainConfig | null>
export async function readConfig(input: string | RepoReader): Promise<ContentrainConfig | null> {
  if (typeof input === 'string') {
    const raw = await readJson<Partial<ContentrainConfig>>(join(contentrainDir(input), 'config.json'))
    return normaliseConfig(raw)
  }
  const raw = await readJsonViaReader<Partial<ContentrainConfig>>(input, CONFIG_PATH)
  return normaliseConfig(raw)
}

/**
 * Read `.contentrain/vocabulary.json`. Same dual signature as {@link readConfig}.
 */
export function readVocabulary(projectRoot: string): Promise<Vocabulary | null>
export function readVocabulary(reader: RepoReader): Promise<Vocabulary | null>
export async function readVocabulary(input: string | RepoReader): Promise<Vocabulary | null> {
  if (typeof input === 'string') {
    return readJson<Vocabulary>(join(contentrainDir(input), 'vocabulary.json'))
  }
  return readJsonViaReader<Vocabulary>(input, VOCABULARY_PATH)
}
