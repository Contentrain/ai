import { pc } from './ui.js'

/**
 * Debug logging — silent by default, enabled by either the
 * `--debug` flag (recognised per-command) or the
 * `CONTENTRAIN_DEBUG=1` env var. Intended for diagnosing
 * git transactions, MCP calls, and file writes when the
 * user-facing output isn't enough.
 *
 * The tiny helper here is deliberately local — we do not want
 * to ship a logging dependency for something this small.
 * Everything routes through stderr so `--json` stdout payloads
 * stay clean and CI can still capture diagnostic output.
 */

let enabled = Boolean(process.env['CONTENTRAIN_DEBUG'])

/** Turn debug on for the rest of the process. Command runners call
 * this when `--debug` is passed. Once on, stays on. */
export function enableDebug(): void {
  enabled = true
}

export function isDebug(): boolean {
  return enabled
}

/** Opening banner for a debug block. `context` is a short label — the
 * command name or helper — that lets the reader grep the noise. */
export function debug(context: string, message: string): void {
  if (!enabled) return
  process.stderr.write(`${pc.dim(`[debug:${context}]`)} ${message}\n`)
}

/** Dump structured payload. Formatted JSON so log collectors can parse it. */
export function debugJson(context: string, label: string, value: unknown): void {
  if (!enabled) return
  try {
    process.stderr.write(`${pc.dim(`[debug:${context}]`)} ${label}\n${JSON.stringify(value, null, 2)}\n`)
  } catch {
    process.stderr.write(`${pc.dim(`[debug:${context}]`)} ${label} <unserialisable>\n`)
  }
}

/** Time a block. Usage:
 *   const end = debugTimer('generate', 'writeClient')
 *   await doWork()
 *   end()  // logs elapsed ms when debug is on; no-op otherwise
 */
export function debugTimer(context: string, label: string): () => void {
  if (!enabled) return () => {}
  const start = performance.now()
  return () => {
    const elapsed = Math.round(performance.now() - start)
    process.stderr.write(`${pc.dim(`[debug:${context}]`)} ${label} (${elapsed}ms)\n`)
  }
}
