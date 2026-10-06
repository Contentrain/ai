import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const MAPPING = join(import.meta.dirname, '..', 'mapping')

/**
 * Every key that appears twice in one object of a JSON text, as a path ("rules[12].props").
 * `JSON.parse` keeps the last duplicate and says nothing, so a rule that repeats `props` silently loses the
 * first one's bindings; only the raw text can show it.
 */
export function duplicateKeys(text: string): string[] {
  const found: string[] = []
  const stack: Array<{ array: boolean, keys: Set<string>, path: string, index: number }> = []
  let expectKey = false
  let lastKey = ''
  const pathOf = () => stack.map(frame => frame.path).join('')
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (ch === '"') {
      let j = i + 1
      while (text[j] !== '"') j += text[j] === '\\' ? 2 : 1
      const value = JSON.parse(text.slice(i, j + 1)) as string
      i = j
      const top = stack.at(-1)
      if (top && !top.array && expectKey) {
        if (top.keys.has(value)) found.push(`${pathOf()}.${value}`.replace(/^\./, ''))
        top.keys.add(value)
        lastKey = value
        expectKey = false
      }
    } else if (ch === '{' || ch === '[') {
      const parent = stack.at(-1)
      const path = parent === undefined ? '' : parent.array ? `[${parent.index}]` : `.${lastKey}`
      stack.push({ array: ch === '[', keys: new Set(), path, index: 0 })
      expectKey = ch === '{'
    } else if (ch === '}' || ch === ']') {
      stack.pop()
      expectKey = false
    } else if (ch === ',') {
      const top = stack.at(-1)
      if (top?.array) top.index++
      else expectKey = true
    }
  }
  return found
}

describe('duplicateKeys', () => {
  it('finds a key repeated in one object, and only there', () => {
    expect(duplicateKeys('{"a":1,"b":{"c":1},"a":2}')).toEqual(['a'])
    expect(duplicateKeys('{"rules":[{"props":{"x":1},"props":{"y":2}}]}')).toEqual(['rules[0].props'])
    expect(duplicateKeys('{"a":{"k":1},"b":{"k":2},"c":[{"k":1},{"k":2}]}')).toEqual([])
    expect(duplicateKeys('{"a":"has \\"a\\" and , in it","b":1}')).toEqual([])
  })
})

describe('mapping tables', () => {
  it('never repeat a key within an object (the last one would win and drop the first one\'s bindings)', async () => {
    const files = (await readdir(MAPPING)).filter(file => file.endsWith('.json')).toSorted()
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) expect(duplicateKeys(await readFile(join(MAPPING, file), 'utf8')), file).toEqual([])
  })
})
