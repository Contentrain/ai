import { readFile, readdir, stat, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'

/**
 * At most this many files open at once for reading, across every caller in the process. Astro starts every
 * collection's loader together, and each reads the project's models and content: a site with hundreds of models
 * asked for hundreds of thousands of files at the same moment and ran out of file descriptors (EMFILE).
 */
export const MAX_OPEN_READS = 64

let open = 0
const waiting: Array<() => void> = []

/** Runs `read` once fewer than {@link MAX_OPEN_READS} reads are in flight. Only for leaf reads: a read must not wait on another. */
export async function limitRead<T>(read: () => Promise<T>): Promise<T> {
  if (open >= MAX_OPEN_READS) await new Promise<void>(resolve => waiting.push(resolve))
  open++
  try {
    return await read()
  }
  finally {
    open--
    waiting.shift()?.()
  }
}

/** A path that is not there (or whose parent is a file) reads as absent; any other failure is a real error. */
function isMissing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  return code === 'ENOENT' || code === 'ENOTDIR'
}

/**
 * The file's JSON, or null when it is not there or is not valid JSON. Any other read failure (EMFILE, EACCES, EIO)
 * throws: reading it as null would drop a model or its content from the build without a word.
 */
export async function readJson<T>(filePath: string): Promise<T | null> {
  const raw = await readText(filePath)
  if (raw === null) return null
  try {
    return JSON.parse(raw) as T
  }
  catch {
    return null
  }
}

/** The directory's entries, or none when it is not there. Any other failure throws. */
export async function readDir(dirPath: string): Promise<string[]> {
  try {
    return await limitRead(() => readdir(dirPath))
  }
  catch (error) {
    if (isMissing(error)) return []
    throw error
  }
}

/** Whether the file is there. Any failure other than its absence throws. */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    return (await limitRead(() => stat(filePath))).isFile()
  }
  catch (error) {
    if (isMissing(error)) return false
    throw error
  }
}

/** The file's text, or null when it is not there. Any other failure throws. */
export async function readText(filePath: string): Promise<string | null> {
  try {
    return await limitRead(() => readFile(filePath, 'utf-8'))
  }
  catch (error) {
    if (isMissing(error)) return null
    throw error
  }
}

export async function writeText(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, content, 'utf-8')
}

export function contentrainDir(projectRoot: string): string {
  return join(projectRoot, '.contentrain')
}
