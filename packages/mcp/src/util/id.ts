import { randomUUID } from 'node:crypto'

export function branchTimestamp(): string {
  const ts = Math.floor(Date.now() / 1000).toString()
  const suffix = randomUUID().slice(0, 4)
  return `${ts}-${suffix}`
}

// generateEntryId is now exported from @contentrain/types
export { generateEntryId } from '@contentrain/types'
