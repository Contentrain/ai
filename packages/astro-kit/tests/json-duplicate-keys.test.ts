import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO = join(import.meta.dirname, '..', '..', '..')

/**
 * Keys an object in this JSON text names twice, as `line: key`. JSON.parse keeps the last one without a word, so a
 * fixture's first block of checks for a file would never run.
 */
function duplicateKeys(text: string): string[] {
  const found: string[] = []
  const open: Array<Set<string> | null> = []
  let line = 1
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '\n') line++
    else if (char === '{') open.push(new Set())
    else if (char === '[') open.push(null)
    else if (char === '}' || char === ']') open.pop()
    else if (char === '"') {
      let end = i + 1
      while (text[end] !== '"') end += text[end] === '\\' ? 2 : 1
      const value = JSON.parse(text.slice(i, end + 1)) as string
      let next = end + 1
      while (/\s/.test(text[next] ?? '')) next++
      const keys = open.at(-1)
      if (text[next] === ':' && keys) {
        if (keys.has(value)) found.push(`${line}: ${value}`)
        keys.add(value)
      }
      i = end
    }
  }
  return found
}

async function jsonUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true })
  return entries.filter(entry => entry.isFile() && entry.name.endsWith('.json') && !entry.parentPath.includes('node_modules')).map(entry => join(entry.parentPath, entry.name))
}

describe('no JSON fixture names a key twice', () => {
  it('finds a key named twice in one object, and not the same key in two objects or a string that only looks like one', () => {
    expect(duplicateKeys('{ "a": 1,\n "b": { "a": 2 },\n "a": 3 }')).toEqual(['3: a'])
    expect(duplicateKeys('{ "a": { "x": 1 }, "b": { "x": 2 }, "c": ["a", "a"], "d": "\\"a\\": 1" }')).toEqual([])
  })

  it.each([['templates'], ['packages/astro-kit/components']])('%s', async (dir) => {
    const files = await jsonUnder(join(REPO, dir))
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) expect(duplicateKeys(await readFile(file, 'utf8')), relative(REPO, file)).toEqual([])
  })
})
