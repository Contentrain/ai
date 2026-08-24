// Small PHP serialize() decoder, ported from the measured import chain.
// Supported: s (byte-length strings), i, d, b, N, a (array → list or object), O (object → { __class, … }).
// PHP string lengths are BYTES, so the walk happens over a Buffer, not a JS string.

export interface UnserializeResult {
  ok: boolean
  serialized: boolean
  value: unknown
  error?: string
}

export function looksSerialized(s: unknown): s is string {
  return typeof s === 'string' && /^(a|O):\d+:[{"]|^(s|i|d|b):[^;]+;?$|^N;$/.test(s)
}

export function phpUnserialize(str: string): unknown {
  const buf = Buffer.from(str, 'utf8')
  let p = 0
  const fail = (m: string): never => {
    throw new Error(`unserialize: ${m} at byte ${p}`)
  }
  const readUntil = (ch: string): string => {
    const i = buf.indexOf(ch, p)
    if (i < 0) fail(`expected ${ch}`)
    const s = buf.toString('utf8', p, i)
    p = i + 1
    return s
  }
  const expect = (ch: string): void => {
    if (buf[p] !== ch.charCodeAt(0)) fail(`expected '${ch}' got '${String.fromCharCode(buf[p] ?? 0)}'`)
    p++
  }
  const value = (): unknown => {
    const t = String.fromCharCode(buf[p] ?? 0)
    p++
    switch (t) {
      case 'N':
        expect(';')
        return null
      case 'b': {
        expect(':')
        return readUntil(';') === '1'
      }
      case 'i': {
        expect(':')
        return Number(readUntil(';'))
      }
      case 'd': {
        expect(':')
        const v = readUntil(';')
        return v === 'INF' ? Infinity : v === '-INF' ? -Infinity : v === 'NAN' ? Number.NaN : Number(v)
      }
      case 's': {
        expect(':')
        const n = Number(readUntil(':'))
        expect('"')
        const s = buf.toString('utf8', p, p + n)
        p += n
        expect('"')
        expect(';')
        return s
      }
      case 'a': {
        expect(':')
        const n = Number(readUntil(':'))
        expect('{')
        const entries: Array<[unknown, unknown]> = []
        for (let i = 0; i < n; i++) {
          const k = value()
          const v = value()
          entries.push([k, v])
        }
        expect('}')
        // consecutive 0..n-1 integer keys → JSON list; anything else → object
        const isList = entries.every(([k], i) => k === i)
        return isList ? entries.map(([, v]) => v) : Object.fromEntries(entries.map(([k, v]) => [String(k), v]))
      }
      case 'O': {
        expect(':')
        readUntil(':')
        expect('"')
        const cls = readUntil('"')
        expect(':')
        const n = Number(readUntil(':'))
        expect('{')
        const o: Record<string, unknown> = { __class: cls }
        for (let i = 0; i < n; i++) {
          const k = value()
          const v = value()
          o[String(k).split('\u0000').at(-1) ?? String(k)] = v
        }
        expect('}')
        return o
      }
      default:
        return fail(`unknown type '${t}'`)
    }
  }
  const v = value()
  if (p !== buf.length) fail(`trailing ${buf.length - p} bytes`)
  return v
}

/** Attempt a decode; on failure the value stays exactly as it was. */
export function tryUnserialize(s: string): UnserializeResult {
  if (!looksSerialized(s)) return { ok: false, serialized: false, value: s }
  try {
    return { ok: true, serialized: true, value: phpUnserialize(s) }
  } catch (e) {
    return { ok: false, serialized: true, value: s, error: e instanceof Error ? e.message : String(e) }
  }
}
