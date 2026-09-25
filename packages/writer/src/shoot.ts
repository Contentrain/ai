// Screenshots of the built site: a static server over dist/ and one browser
// for the whole run.

import { existsSync, readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { extname, join, normalize } from 'node:path'
import { chromium, type Browser } from 'playwright'
import { PNG } from 'pngjs'

const TYPES: Record<string, string> = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif',
  '.xml': 'application/xml', '.json': 'application/json',
}

export class Shooter {
  private server: Server | undefined
  private browser: Browser | undefined
  private origin = ''

  constructor(private readonly dist: string) {}

  private async start(): Promise<void> {
    if (this.server) return
    this.server = createServer((req, res) => {
      const path = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '')
      let file = join(this.dist, path)
      if (path.endsWith('/')) file = join(file, 'index.html')
      if (!file.startsWith(this.dist) || !existsSync(file)) {
        res.writeHead(404).end()
        return
      }
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file))
    })
    await new Promise<void>(done => this.server!.listen(0, '127.0.0.1', done))
    this.origin = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`
    this.browser = await chromium.launch(process.platform === 'darwin' ? { channel: 'chrome' } : {})
  }

  /** Full-page screenshot of a site path at a viewport width. */
  async shoot(path: string, width: number): Promise<PNG> {
    await this.start()
    const page = await this.browser!.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' })
    try {
      await page.goto(`${this.origin}${path}`, { waitUntil: 'networkidle' })
      // Runs in the page, where `document` exists; typed loosely because this package compiles without the DOM lib.
      await page.evaluate('document.fonts.ready')
      return PNG.sync.read(await page.screenshot({ fullPage: true, animations: 'disabled' }))
    } finally {
      await page.close()
    }
  }

  async close(): Promise<void> {
    await this.browser?.close()
    await new Promise<void>(done => (this.server ? this.server.close(() => done()) : done()))
    this.server = undefined
    this.browser = undefined
  }
}
