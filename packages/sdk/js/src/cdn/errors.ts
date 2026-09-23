export class ContentrainError extends Error {
  /**
   * The API's machine code, when the error body carries one (`data.code`,
   * e.g. `payment_required`). Branch on it or on `status`, never on the
   * message: that is display text, and some is written for the workspace
   * owner rather than a visitor.
   */
  code?: string

  constructor(
    public status: number,
    message: string,
    code?: string,
  ) {
    super(message)
    this.name = 'ContentrainError'
    if (code) this.code = code
  }
}

/**
 * The workspace's subscription is inactive: Studio answers `402` with
 * `data.code: 'payment_required'` on the public forms and comments endpoints
 * while billing is locked. Not transient — no retry helps until the owner
 * updates billing — and its message addresses the owner, so a site hides the
 * form or thread instead of showing it to a visitor.
 */
export function isPaymentRequired(error: unknown): boolean {
  // By shape, not instanceof: a page can bundle two copies of the SDK (ESM
  // and CJS, or a duplicate install), and an error from one is not an
  // instance of the other's class.
  if (!error || typeof error !== 'object') return false
  const e = error as { name?: unknown; status?: unknown; code?: unknown }
  return e.name === 'ContentrainError' && (e.status === 402 || e.code === 'payment_required')
}
