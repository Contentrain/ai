import { readFile, readdir, access, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { canonicalStringify } from './serializer.js'

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

export async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(filePath, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export async function readDir(dirPath: string): Promise<string[]> {
  try {
    return await readdir(dirPath)
  } catch {
    return []
  }
}

export async function writeJson(filePath: string, data: unknown, fieldOrder?: string[]): Promise<void> {
  await mkdir(join(filePath, '..'), { recursive: true })
  await writeFile(filePath, canonicalStringify(data, fieldOrder), 'utf-8')
}

export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true })
}

export async function readText(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf-8')
  } catch {
    return null
  }
}

export async function writeText(filePath: string, content: string): Promise<void> {
  await mkdir(join(filePath, '..'), { recursive: true })
  await writeFile(filePath, content, 'utf-8')
}

export function contentrainDir(projectRoot: string): string {
  return join(projectRoot, '.contentrain')
}
