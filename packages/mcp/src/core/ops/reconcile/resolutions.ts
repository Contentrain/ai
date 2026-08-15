import { conflictId } from '@contentrain/types'
import type { ConflictResolution } from '@contentrain/types'

/**
 * Candidate identity at a conflict site — the same tuple `conflictId`
 * hashes, so a stored resolution matches exactly when position AND values
 * are unchanged since the dry-run that produced it (N1: compare-and-set).
 */
export interface ConflictCandidate {
  path: string
  key?: string
  field?: string
  locale?: string
  base?: unknown
  ours?: unknown
  theirs?: unknown
}

/**
 * The decisions carried into a second reconcile round, indexed by conflict
 * id. Merge functions call `consume` at the exact point they would create a
 * `ConflictItem`; a hit turns the conflict into a mechanical outcome, a
 * miss reports it. After planning, `unconsumed()` names the stale
 * resolutions — values changed between rounds, so the decision no longer
 * applies and the conflict reappears with a fresh id.
 */
export class ResolutionIndex {
  private readonly byId = new Map<string, ConflictResolution>()
  private readonly consumed = new Set<string>()

  constructor(resolutions: ConflictResolution[] = []) {
    for (const resolution of resolutions) this.byId.set(resolution.id, resolution)
  }

  consume(candidate: ConflictCandidate): ConflictResolution | null {
    const id = conflictId(candidate)
    const resolution = this.byId.get(id)
    if (!resolution) return null
    this.consumed.add(id)
    return resolution
  }

  unconsumed(): ConflictResolution[] {
    return [...this.byId.values()].filter(r => !this.consumed.has(r.id))
  }
}

/**
 * Apply a consumed resolution to the candidate's values. `choose` picks a
 * side (absence on that side means deletion → `undefined`); `value`
 * supplies a replacement outright.
 */
export function resolvedValue(
  resolution: ConflictResolution,
  candidate: ConflictCandidate,
): unknown {
  if ('choose' in resolution) {
    return resolution.choose === 'ours' ? candidate.ours : candidate.theirs
  }
  return resolution.value
}
