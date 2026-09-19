// @contentrain/decide — small typed decisions for migration and governance
// pipelines. A decision is a pick from a closed set or a place on a fixed
// rubric, asked of a chain: a deterministic rule first, then Jev
// (typesafe.ai), then an LLM (Claude Haiku, or your own) when Jev does not answer. Every answer is cached by
// its shaped input, capped by a per-tenant budget, guarded by a circuit
// breaker and written to an audit log; no provider failure ever fails a call.

export { createDecider, decide } from './decide.js'
export type { DecideOptions, Decider, DeciderConfig, Pricing } from './decide.js'
export { JsonlDecisionCache, MemoryDecisionCache, cacheKey } from './cache.js'
export type { CachedDecision, DecisionCache } from './cache.js'
export { JsonlAuditLog, MemoryAuditLog, toAuditRecord } from './audit.js'
export type { AuditRecord, AuditSink } from './audit.js'
export { CircuitBreaker, MemoryDailyBudget } from './budget.js'
export type { CircuitBreakerOptions, DecisionBudget } from './budget.js'
export { DEFAULT_BATCH, estimateTokens, planBatches } from './batch.js'
export type { BatchLimits } from './batch.js'
export { DEFAULT_JEV_MODEL, JEV_ENDPOINT, JEV_TOKEN_ENV, JevError, buildJevRequest, createJevProvider, readJevResponse, requestShapeHash } from './jev.js'
export type { JevProviderOptions } from './jev.js'
export { noopLlmProvider } from './llm.js'
export { ANTHROPIC_ENDPOINT, ANTHROPIC_KEY_ENV, AnthropicError, DEFAULT_ANTHROPIC_MODEL, anthropicRequestShapeHash, buildAnthropicRequest, createAnthropicProvider, genericLlmPrompt, readAnthropicResponse } from './anthropic.js'
export type { AnthropicProviderOptions } from './anthropic.js'
export { BUILTIN_KINDS } from './kinds/index.js'
export { PUNCH_CLASSES, PUNCH_CLASS_CRITERIA, PUNCH_SEVERITY_CRITERIA, punchItem, punchItemRule, severityLevel, shapePunchItem } from './kinds/punch-item.js'
export type { PunchClass, PunchItemInput, PunchItemShaped } from './kinds/punch-item.js'
export { ELIGIBILITY_CHOICES, NEEDS_HUMAN, eligibilityBand, eligibilityRule, shapeEligibility } from './kinds/eligibility-band.js'
export type { EligibilityBandInput, EligibilityBandShaped, EligibilityChoice } from './kinds/eligibility-band.js'
export { scrubSlug, scrubText } from './kinds/shape.js'
export { createReplayFetch, measurePunchCalibration, stableChoices } from './calibration.js'
export type { PunchCalibration, PunchLabel, RecordedCase } from './calibration.js'
export type {
  Decision,
  DecisionProvider,
  DecisionSource,
  FallbackReason,
  JevAnswer,
  JevQuestion,
  JevSpec,
  KindSpec,
  Outcome,
  ProviderAnswer,
  RuleVerdict,
  TokenCost,
} from './types.js'
