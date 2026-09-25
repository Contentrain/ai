import type { KindSpec } from '../types.js'
import { eligibilityBand } from './eligibility-band.js'
import { fieldType, regionName, unmappedElement } from './facts.js'
import { punchItem } from './punch-item.js'

export const BUILTIN_KINDS: ReadonlyArray<KindSpec<any, any>> = [punchItem, eligibilityBand, fieldType, regionName, unmappedElement]
