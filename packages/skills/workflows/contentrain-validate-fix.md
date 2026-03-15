# Skill: Validate and Fix Content Issues

> Diagnose validation failures, apply safe fixes, and re-check the project.

---

## When to Use

Use this when:

- validation reports errors or warnings
- the user asks to fix schema/content issues
- a write operation succeeded but the project still needs verification

---

## Steps

### 1. Run Validation

Call `contentrain_validate` first.

Group results into:

- schema/type errors
- missing required fields
- relation integrity problems
- locale completeness issues
- canonical format warnings

### 2. Decide Auto-fix vs Manual Fix

Auto-fix candidates:

- canonical formatting
- orphan metadata cleanup
- structural housekeeping reported by the validator

Manual fix candidates:

- missing required content
- wrong field values
- broken relations
- incorrect slugs/IDs

### 3. Use Auto-fix Carefully

If the issues are structural, run:

```json
{
  "fix": true
}
```

After that, validate again.

### 4. Fix Semantic Errors

For real content or schema issues:

- inspect the model with `contentrain_describe`
- patch content with `contentrain_content_save`
- patch schema with `contentrain_model_save`

Do not claim the project is valid until validation is rerun.

### 5. Re-run Validation

Call `contentrain_validate` again and compare:

- errors reduced to zero
- remaining warnings acknowledged

### 6. Submit or Recommend Review

If validation is clean:

- call `contentrain_submit` when pending review branches exist

If validation still fails:

- summarize remaining blockers precisely
- tell the user which model/entry needs manual attention

