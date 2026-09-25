// Region-cropped visual comparison: the source page's render (from the fact
// pack) against the migrated page's, at one width. The agent gets both crops
// as images — that is what it judges by — and a rough score for the report.

import { readFile } from 'node:fs/promises'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'

export type Box = [number, number, number, number]

/** Crop a PNG to a box, clamped to the image. */
export function crop(png: PNG, [x, y, w, h]: Box): PNG {
  const left = Math.max(0, Math.min(png.width, Math.round(x)))
  const top = Math.max(0, Math.min(png.height, Math.round(y)))
  const width = Math.max(1, Math.min(png.width - left, Math.round(w)))
  const height = Math.max(1, Math.min(png.height - top, Math.round(h)))
  const out = new PNG({ width, height })
  PNG.bitblt(png, out, left, top, width, height, 0, 0)
  return out
}

/** Pad to a size with white, so two crops of different heights can be compared. */
function pad(png: PNG, width: number, height: number): PNG {
  if (png.width === width && png.height === height) return png
  const out = new PNG({ width, height })
  out.data.fill(255)
  PNG.bitblt(png, out, 0, 0, Math.min(png.width, width), Math.min(png.height, height), 0, 0)
  return out
}

export interface Comparison {
  /** 1 = identical pixels, 0 = nothing alike. Size differences count as difference. */
  score: number
  source: Buffer
  output: Buffer
  diff: Buffer
}

export function compare(source: PNG, output: PNG): Comparison {
  const width = Math.max(source.width, output.width)
  const height = Math.max(source.height, output.height)
  const a = pad(source, width, height)
  const b = pad(output, width, height)
  const diff = new PNG({ width, height })
  const changed = pixelmatch(a.data, b.data, diff.data, width, height, { threshold: 0.15 })
  return {
    score: Math.round((1 - changed / (width * height)) * 1000) / 1000,
    source: PNG.sync.write(source),
    output: PNG.sync.write(output),
    diff: PNG.sync.write(diff),
  }
}

export async function readPng(path: string): Promise<PNG> {
  return PNG.sync.read(await readFile(path))
}
