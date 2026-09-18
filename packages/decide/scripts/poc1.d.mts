import type { PunchItemInput } from '../src/kinds/punch-item.js'
import type { JevAnswer } from '../src/types.js'

export interface Poc1Case {
  site: string
  input: PunchItemInput
  expected?: { class: string, severity: number }
  answers: Record<string, JevAnswer>
}

export function loadPoc1(dir: string): Poc1Case[]
