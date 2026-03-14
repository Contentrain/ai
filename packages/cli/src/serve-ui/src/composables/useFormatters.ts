/**
 * Formatting utilities — mirrors old client's display patterns
 */

/** Format date as "Mar 14" title + "2:30 PM" subtitle */
export function formatDate(dateStr: string | undefined): { title: string; subtitle: string } {
  if (!dateStr) return { title: '—', subtitle: '' }
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return { title: '—', subtitle: '' }
  const title = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const subtitle = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return { title, subtitle }
}

/** Format relative time: "2m ago", "3h ago", "Mar 14" */
export function formatRelativeTime(dateStr: string | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return '—'
  const diff = Date.now() - d.getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Truncate string with ellipsis */
export function truncate(val: unknown, max = 50): string {
  if (val === undefined || val === null || val === '') return ''
  const s = typeof val === 'string' ? val : JSON.stringify(val) ?? ''
  return s.length > max ? `${s.slice(0, max)}...` : s
}

/** Detect field display type for table cell rendering */
export type CellDisplayType =
  | 'text' | 'boolean' | 'array' | 'number'
  | 'image' | 'markdown' | 'richtext'
  | 'date' | 'color' | 'relation' | 'empty'

export function detectCellType(value: unknown, fieldType?: string): CellDisplayType {
  if (value === undefined || value === null || value === '') return 'empty'
  if (fieldType === 'markdown') return 'markdown'
  if (fieldType === 'richtext') return 'richtext'
  if (fieldType === 'image' || fieldType === 'video' || fieldType === 'file') return 'image'
  if (fieldType === 'date' || fieldType === 'datetime') return 'date'
  if (fieldType === 'color') return 'color'
  if (fieldType === 'relation' || fieldType === 'relations') return 'relation'
  if (typeof value === 'boolean') return 'boolean'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'number') return 'number'
  return 'text'
}

/** Copy text to clipboard with feedback */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
