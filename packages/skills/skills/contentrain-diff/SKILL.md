---
name: contentrain-diff
description: "View content diffs between Contentrain branches. Use when comparing changes, reviewing branch differences, or checking what changed."
metadata:
  author: Contentrain
  version: "1.0.0"
---

# Skill: Review Pending Branches with `contentrain diff`

> Inspect pending Contentrain branches and decide whether to merge, reject, or defer them.

---

## When to Use

Use this when:

- the project has pending `contentrain/*` branches
- the user asks to review or merge changes
- branch pressure is growing and cleanup is needed

---

## Steps

### 1. Check Branch Pressure

Start with `contentrain status`.

If many `contentrain/*` branches are active, move into review immediately.

### 2. Run `contentrain diff`

Use the CLI to:

- list pending branches
- inspect the diff summary
- review full patch output

### 3. Evaluate the Change

Check:

- which model/content files changed
- whether the change matches the intended operation
- whether validation/normalize work was completed properly

### 4. Choose an Outcome

- merge when the diff is correct and complete
- delete when the change is wrong or should be rejected
- defer only when more human input is required

### 5. Report the Decision

Summarize:

- branch reviewed
- action taken
- base branch affected
- any follow-up branch still pending
