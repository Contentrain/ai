// ─── LLM provider (bring your own) ───
//
// The last link in the chain, for a host that wires its own model to a closed
// decision list. This package ships the interface and a provider that is never
// available; it does not call any model itself.

import type { DecisionProvider } from './types.js'

export const noopLlmProvider: DecisionProvider = {
  name: 'llm',
  available: () => false,
  ask: async () => {
    throw new Error('no LLM provider is configured')
  },
}
