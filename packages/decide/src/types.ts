// ─── The decision contract ───
//
// A decision is a pick from a closed set (choice) or a place on a fixed rubric
// (score) — never generated text. Every kind declares its closed set, a schema
// version and an input shaper; the chain that answers it is rule → jev → llm,
// with the rule's tentative answer as the fallback when no provider answers.

/** Where a decision came from. `cache` is a provider answer served again. */
export type DecisionSource = 'rule' | 'jev' | 'llm' | 'cache'

/** Why a decision fell back to the rule instead of a provider answer. */
export type FallbackReason = 'no_provider' | 'budget' | 'circuit_open' | 'timeout' | 'error' | 'no_answer'

/** One Jev question, as the systemone endpoint takes it. */
export type JevQuestion =
  | { type: 'choice', instructions: string, criteria: Record<string, string> }
  | { type: 'score', instructions: string, criteria: readonly string[] }
  | { type: 'noul', instructions: string }

/** One Jev answer, as the systemone endpoint returns it. */
export type JevAnswer =
  | { type: 'choice', choice: string, confidence: number, probabilities?: Record<string, number> }
  | { type: 'score', score: number, confidence: number, probabilities?: Record<string, number> }
  | { type: 'noul', noul: number }

/** What a rule or a provider concluded about one input. */
export interface Outcome {
  choice?: string
  score?: number
  /** 0–1. For a kind that asks more than one question, the lowest of them. */
  confidence: number
  probabilities?: Record<string, number>
}

/** A rule's answer. `final` means certain: no provider is asked. */
export interface RuleVerdict extends Outcome {
  /**
   * `true` — the rule decides and no provider is asked.
   * `false` — tentative: the input is in the kind's undecided band. Providers
   * are asked, and this is the answer when none of them answers.
   */
  final: boolean
}

export interface TokenCost {
  input_tokens: number
  output_tokens: number
  /** Only when a price was configured; the vendor publishes none. */
  usd?: number
}

export interface Decision {
  kind: string
  /** The kind's schema version the decision was made under. */
  version: string
  /** sha256 of kind, version, request shape and canonical shaped input — the cache key, and all the audit log keeps of the input. */
  key: string
  /** Hash of the provider request shape the decision was keyed under (`requestShapeHash`); `none` for a kind with no provider prompt. */
  shape: string
  choice?: string
  score?: number
  confidence: number
  probabilities?: Record<string, number>
  source: DecisionSource
  /** A provider's choice that fell below the kind's confidence floor; `choice` is then the kind's human-review choice. */
  proposed?: string
  /** Set when the decision is the rule's tentative answer because no provider answered. */
  unreviewed?: true
  fallback?: FallbackReason
  /** This decision's share of the batch's usage. Absent for rule and cache answers. */
  cost?: TokenCost
  /** Wall time to reach this decision; for a batched answer, the batch's. */
  ms: number
  /** The provider's model string, when it reported one. */
  model?: string
}

/**
 * A kind's Jev request shape. It only ever sees the shaped input. The request a
 * batch sends is `header(first item)` followed by one `Item <n>: <render>` line
 * per item, with `questions('item<n>')` asked of every item.
 *
 * Everything here is part of what was calibrated. The request-shape hash
 * (`requestShapeHash`) is taken over a request built from `probe`; it enters
 * the cache key and the audit log, so a changed shape never reuses an answer.
 */
export interface JevSpec<S> {
  /** Text the request's state opens with, from the batch's first item. Absent: none. */
  header?: (shaped: S) => string
  /** Items in different groups never share a request (PoC-1 sent one site per request). */
  group?: (shaped: S) => string
  /** One item's line, after `Item <n>: `. */
  render: (shaped: S) => string
  /** The questions asked of one item. Keys are suffixes: the request asks `<prefix>_<suffix>`. */
  questions: (prefix: string) => Record<string, JevQuestion>
  /** The item's answers (keyed by suffix) as an outcome, or undefined when they do not make one. */
  read: (answers: Record<string, JevAnswer>) => Outcome | undefined
  /** Batch limits of the calibrated shape. They take precedence over the decider's. */
  batch?: { maxItems?: number, maxTokens?: number }
  /** A representative shaped input, used to hash the request shape. */
  probe: S
}

export interface KindSpec<I = unknown, S = unknown> {
  kind: string
  /** Bump on any change to the shaper, the choices or the prompt: it is part of the cache key. */
  version: string
  /** The closed set a choice must come from. */
  choices?: readonly string[]
  /** Inclusive range a score must fall in. */
  scoreRange?: readonly [number, number]
  /**
   * The input shaper. Its result is the only part of the input that leaves the
   * process or reaches the cache key: plain JSON, nothing a decision does not
   * need — no full content, no URLs, no identities.
   */
  shape: (input: I) => S
  /** The deterministic rule, asked first. Undefined: no opinion. */
  rule?: (input: I) => RuleVerdict | undefined
  jev?: JevSpec<S>
  /**
   * Below `threshold` a provider's choice is not trusted: the decision's
   * `choice` becomes `choice` here and the provider's pick moves to `proposed`.
   * This choice is never offered to a provider.
   */
  lowConfidence?: { threshold: number, choice: string }
}

/** What a provider returns for one batch: an outcome per item, in order. */
export interface ProviderAnswer {
  outcomes: Array<Outcome | undefined>
  usage?: { input_tokens: number, output_tokens: number }
  model?: string
}

export interface DecisionProvider {
  readonly name: 'jev' | 'llm'
  /** Whether the provider can be asked at all (a token is set, a model is wired). */
  available: () => boolean
  /** The model the provider asks, when it names one; part of the request shape. */
  readonly model?: string
  /** Answer one batch. Throws on transport failure; the decider turns that into a fallback. */
  ask: (spec: KindSpec<any, any>, shaped: unknown[]) => Promise<ProviderAnswer>
}
