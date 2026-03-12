import { randomUUID } from 'node:crypto'

export function branchTimestamp(): string {
  return Math.floor(Date.now() / 1000).toString()
}

export function generateEntryId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 12)
}
