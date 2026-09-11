---
"@contentrain/types": minor
---

Execution, approval and source-delta contracts — the shapes an operation is described, approved and recorded with

`migration.ts` describes a site; the new `execution.ts` describes an act upon
one. Three repositories meet here and none may define these shapes for itself:
the migration engine produces plans and receipts, Studio renders the plan card
and collects approvals, MCP is where a plan's steps run. If each wrote its own
`RiskClass`, "destructive" would mean three different things and the approval
guarding it would be theatre.

- **Risk** — `RiskClass` as an ordered ladder (`read_only` → `low_risk_content`
  → `bulk_content` → `destructive_schema` → `external_effect` →
  `financially_material` → `deployment`), with `riskRank()` and `highestRisk()`.
  A plan is rated by its worst step: a survey that ends in a deploy is a deploy.
- **Approval** — `ApprovalGate` separates the three decisions that were being
  collapsed into one: `plan` (scope and cost, before the work), `change` (the
  produced diff), `release` (production effect). `ApprovalRule` /
  `ApprovalPolicyFile` describe `.contentrain/approval-policies.json`;
  `ApprovalGrant` binds a decision to an exact `plan_hash`, so an approval of
  "publish these 12 posts" cannot carry over to a plan that publishes 400.
  `ActorRef.kind` is load-bearing — an agent may never approve its own work.
- **Plans and receipts** — `ExecutionPlan`, `ExecutionStep`, `ExecutionScope`,
  `ExecutionEstimate`, `RollbackPlan`, `ExecutionReceipt`, `Checkpoint`,
  `VerificationCheck`, `RunStatus`. Plan and receipt share one
  `ExecutionScope` shape so prediction and outcome can be subtracted.
  `approversFor(receipt, gate)` reads release approvers off the grants rather
  than duplicating them into a second field that can disagree.
- **`plan_hash`** — `computePlanHash()` is SHA-256 over `planHashPayload()`:
  canonical JSON of the plan's semantic fields, excluding `plan_hash`, `id`,
  `created_at`, `created_by` and `idempotency_key`. Regenerating the same
  operation must produce the same hash or idempotency and approval binding both
  break; a widened scope or a withdrawn rollback must not. Async, on Web
  Crypto, because this package is consumed in Node, workers and browsers alike.
  A non-cryptographic hash was rejected — approvals are pinned to this value,
  so a collision is an approval bypass. The digest is reproducible from the
  contract alone: the suite pins a golden hash cross-checked against an
  independent implementation in another language.
- **`SourceDeltaPlan`** — the WordPress→repository delta, which is *not*
  `contentrain_reconcile`: that merges two git branches and knows nothing about
  WordPress. Carries explicit deletion tombstones, because `modified_after` is
  a filter on changed records and never reports a deletion; a plan that says
  `deletions_detectable: false` must not be read as "nothing was deleted". Also
  slug moves (which generate redirects) and semantic conflicts.
- **`DeploymentTarget`** carries a `secret_ref`, never a secret — the document
  is written to git. **`AutomationDefinition`** is a type reservation so the
  first writer of `.contentrain/automations.json` does not invent a fourth
  vocabulary for schedules.

The evaluator (`approval.ts`) is the decision procedure over these shapes:
`requiredApprovals(plan, policy)` for the plan card, `evaluateApproval(...)` at
the gate. It replaces a role check — `shouldAutoMerge` asks "is this person an
owner?", which cannot express "a bulk publish needs a second pair of eyes even
from the owner" and cannot tell a typo fix from a domain cutover.

- A plan cannot understate itself: `effectiveRisk()` takes the worst of the
  declared class and the steps', so a plan labelled `read_only` carrying a
  deploy step is evaluated as a deploy.
- Each matching rule is its own requirement and all must be met. Merging two
  rules needs a way to combine modes, roles and counts, and every such rule has
  a case where the result is looser than one of its inputs.
- `auto` does not climb the ladder, though every other mode does. If it did,
  one `auto` rule on a low rung would exempt every heavier operation above it —
  the one mode that demands nothing would become the only mode that can loosen
  a policy.
- An agent never approves; a plan's author cannot approve it unless the project
  sets `allow_self_approval`, and that setting does not extend to agents.
- A `change` decision is a decision about a diff: presented with a different
  branch tip than the one reviewed, it does not count.
- `now` is an input, never the clock, so a blocked run can be explained months
  later by replaying the same arguments.

Every decision that did not count comes back with a machine-readable reason
(`GrantRejection`), because the useful question is never "is it blocked" but
"I approved this, why is it still blocked". `DEFAULT_APPROVAL_POLICY` covers a
project with no `.contentrain/approval-policies.json`: read-only work proceeds,
everything else wants one reviewer on the diff.

Also reserves four names in `PATH_PATTERNS` (`capabilities.json`,
`automations.json`, `approval-policies.json`, `redirects.json`) and exports them
as `RESERVED_PATHS` / `isReservedPath()`. `.contentrain/` is a shared namespace,
so a name claimed here cannot later be taken for something else. Until a tool
owns one, doctor and validate ignore them and reconcile treats each as one
opaque file — take the side that changed it, `file_conflict` when both did,
never a merge of an interior it does not understand. Both behaviours are now
pinned by tests in `@contentrain/mcp`.

Internal: `sortKeys` / `canonicalStringify` moved to `canonical.ts` and are
re-exported unchanged, so `execution.ts` can hash plans without an import cycle
through `index.ts`. No public surface change.
