// ---------------------------------------------------------------------------
// Ephemeral localhost HTTP server for the OAuth callback leg.
//
// Security:
//   - Binds to 127.0.0.1 only (never 0.0.0.0)
//   - crypto.randomUUID() state parameter for CSRF protection
//   - Auto-closes after receiving the callback or on timeout
//   - Only handles GET /callback — everything else returns 404
// ---------------------------------------------------------------------------

import { createServer, type Server } from 'node:http'
import { randomUUID } from 'node:crypto'

export interface OAuthCallbackResult {
  code: string
  state: string
}

export interface OAuthServer {
  /** Full URL for the /callback endpoint (e.g. http://127.0.0.1:9876/callback) */
  callbackUrl: string
  /** Cryptographic state value to include in the OAuth redirect URL */
  state: string
  /** Resolves when the OAuth provider redirects back with code + state */
  waitForCallback: () => Promise<OAuthCallbackResult>
  /** Shut down the server (safe to call multiple times) */
  close: () => void
}

const PORT_RANGE_START = 9876
const PORT_RANGE_END = 9899
const DEFAULT_TIMEOUT_MS = 120_000 // 2 minutes

const SUCCESS_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Contentrain CLI</title>
<style>body{font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#fafafa}
.box{text-align:center;padding:2rem;border-radius:12px;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.08)}
h1{font-size:1.5rem;margin:0 0 .5rem}p{color:#666;margin:0}</style></head>
<body><div class="box"><h1>Authenticated</h1><p>You can close this tab and return to your terminal.</p></div></body></html>`

/**
 * Start an ephemeral OAuth callback server.
 *
 * Tries ports in the 9876-9899 range until one is available.
 * The server shuts down automatically after a callback or timeout.
 */
export async function startOAuthServer(
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<OAuthServer> {
  const state = randomUUID()
  const server = createServer()

  const port = await listenOnAvailablePort(server)

  const callbackUrl = `http://127.0.0.1:${port}/callback`

  let settled = false
  let resolveCallback: (result: OAuthCallbackResult) => void
  let rejectCallback: (error: Error) => void

  const callbackPromise = new Promise<OAuthCallbackResult>((resolve, reject) => {
    resolveCallback = resolve
    rejectCallback = reject
  })

  // Prevent Node.js "unhandled rejection" warnings when close() is called
  // before anyone awaits waitForCallback(). The caller still gets the
  // rejection when they await the returned promise.
  callbackPromise.catch(() => { /* handled by caller */ })

  // Timeout — reject if no callback arrives in time
  const timer = setTimeout(() => {
    if (!settled) {
      settled = true
      closeServer(server)
      rejectCallback(new Error(
        `OAuth callback timed out after ${Math.round(timeoutMs / 1000)}s. Please try again.`,
      ))
    }
  }, timeoutMs)

  // Request handler
  server.on('request', (req, res) => {
    if (!req.url?.startsWith('/callback')) {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not found')
      return
    }

    const url = new URL(req.url, `http://127.0.0.1:${port}`)
    const code = url.searchParams.get('code')
    const returnedState = url.searchParams.get('state')
    const error = url.searchParams.get('error')

    // Serve the HTML response immediately so the browser doesn't hang
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(SUCCESS_HTML)

    if (settled) return

    settled = true
    clearTimeout(timer)

    // Schedule server close after response is flushed
    setTimeout(() => closeServer(server), 500)

    if (error) {
      rejectCallback(new Error(`OAuth provider returned an error: ${error}`))
      return
    }

    if (!code || !returnedState) {
      rejectCallback(new Error('OAuth callback missing code or state parameter.'))
      return
    }

    resolveCallback({ code, state: returnedState })
  })

  const close = (): void => {
    if (!settled) {
      settled = true
      clearTimeout(timer)
      rejectCallback(new Error('OAuth flow cancelled.'))
    }
    closeServer(server)
  }

  return {
    callbackUrl,
    state,
    waitForCallback: () => callbackPromise,
    close,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function listenOnAvailablePort(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    let port = PORT_RANGE_START

    const tryPort = (): void => {
      if (port > PORT_RANGE_END) {
        reject(new Error(
          `Could not find an available port in range ${PORT_RANGE_START}-${PORT_RANGE_END}. `
          + 'Close other processes or try again.',
        ))
        return
      }

      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          port++
          tryPort()
        } else {
          reject(err)
        }
      })

      server.listen(port, '127.0.0.1', () => {
        resolve(port)
      })
    }

    tryPort()
  })
}

function closeServer(server: Server): void {
  try {
    server.close()
    server.closeAllConnections()
  } catch {
    // Already closed
  }
}
