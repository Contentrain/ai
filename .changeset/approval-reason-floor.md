---
'@contentrain/types': patch
---

`evaluateApproval`'s reasons no longer call a rule's risk floor "the plan's" risk. A `bulk_content` plan held by the default `low_risk_content` rule read "because the plan is low_risk_content"; it now reads "because the policy requires it at low_risk_content and above (this plan is bulk_content)". When the plan sits at the rule's class, or the policy's default mode produced the requirement, it still says "because the plan is …". `ApprovalRequirement.because` is unchanged (the rule's risk class); its doc now says it is a floor, and `ApprovalDecision.risk` is the plan's own.
