import pc from 'picocolors'

export { pc }

export function severityColor(severity: 'error' | 'warning' | 'notice'): (s: string) => string {
  switch (severity) {
    case 'error': return pc.red
    case 'warning': return pc.yellow
    case 'notice': return pc.blue
  }
}

export function formatCount(n: number, singular: string, plural?: string): string {
  const label = n === 1 ? singular : (plural ?? `${singular}s`)
  return `${n} ${label}`
}

export function formatPercent(part: number, total: number): string {
  if (total === 0) return '—'
  const pct = Math.round((part / total) * 100)
  const color = pct === 100 ? pc.green : pct >= 75 ? pc.yellow : pc.red
  return color(`${pct}%`)
}

export function padRight(str: string, len: number): string {
  return str.length >= len ? str : str + ' '.repeat(len - str.length)
}

export function formatTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => (r[i] ?? '').length)),
  )

  const headerLine = headers.map((h, i) => padRight(h, widths[i] ?? h.length)).join('  ')
  const separator = widths.map(w => '─'.repeat(w)).join('──')
  const bodyLines = rows.map(row =>
    row.map((cell, i) => padRight(cell, widths[i] ?? cell.length)).join('  '),
  )

  return [headerLine, separator, ...bodyLines].join('\n')
}

export function statusIcon(pass: boolean): string {
  return pass ? pc.green('✓') : pc.red('✗')
}
