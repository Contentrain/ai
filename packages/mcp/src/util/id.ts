import { randomUUID } from 'node:crypto'

export function branchTimestamp(): string {
  const ts = Math.floor(Date.now() / 1000).toString()
  const suffix = randomUUID().slice(0, 4)
  return `${ts}-${suffix}`
}

export function generateEntryId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 12)
}
