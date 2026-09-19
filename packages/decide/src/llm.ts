// ─── LLM provider (the last link) ───
//
// The link asked for what Jev does not answer. `createAnthropicProvider()`
// (anthropic.ts) wires Claude Haiku; a host can wire its own model to the
// kind's closed decision list instead. The default is a provider that is never
// available, so no model is called unless the host opts in.

import type { DecisionProvider } from './types.js'

export const noopLlmProvider: DecisionProvider = {
  name: 'llm',
  available: () => false,
  ask: async () => {
    throw new Error('no LLM provider is configured')
  },
}
