---
name: contentrain-serve
description: "Start the local Contentrain review and normalize UI. Use when launching the serve interface, reviewing changes visually, or managing normalize plans."
metadata:
  author: Contentrain
  version: "1.0.0"
---

# Skill: Review the Project with `contentrain serve`

> Start the local review UI as a bridge between agent and developer.

---

## When to Use

Use this when:

- a normalize plan, branch, or validation result needs developer review
- the developer wants to browse models, content, or history visually
- another skill needs to hand off to the UI for approval (normalize, review)

---

## Steps

### 1. Check if Serve is Already Running

Before starting a new instance, check if port 3333 is already in use:

```bash
lsof -ti:3333
```

If a process is running, serve is already up — skip to Step 3.

### 2. Start Serve

Run from the project root (where `.contentrain/` lives):

```bash
contentrain serve
```

Optional flags:

- `--port` (default: 3333)
- `--host` (default: localhost)
- `--open=false` (prevent auto-opening browser)
- `--stdio` (MCP stdio transport for IDE integration — no web UI)

Wait for the "Contentrain Serve" banner confirming the server is ready.

### 3. Direct the Developer to the Right Page

Based on the current context, tell the developer exactly where to go:

| Context | URL | What to do |
|---|---|---|
| Normalize plan ready | `http://localhost:3333/normalize` | Review extractions, approve or reject |
| Pending branches | `http://localhost:3333/branches` | Review and merge branches |
| Validation issues | `http://localhost:3333/validate` | Inspect errors and warnings |
| Content browsing | `http://localhost:3333/content` | Browse entries and models |
| General overview | `http://localhost:3333` | Dashboard with project stats |

### 4. Wait for Developer Action

After directing the developer to the UI:

- **Normalize flow:** Check `.contentrain/normalize-plan.json` — if deleted, check for new branches to determine approve vs reject
- **Branch flow:** Check branch list — if branch was merged or deleted, proceed accordingly
- **Validation flow:** Re-read validation results after developer reviews

The UI communicates back through filesystem changes (plan files, branches, context.json). Poll these to detect the developer's decision.

### 5. Resume the Workflow

After the developer acts in the UI:

- If **approved**: continue with the next step in the calling skill (validate, submit, Phase 2)
- If **rejected**: ask the developer what to change and iterate
- If **merged**: confirm and report the final state

Do NOT leave the developer hanging — always follow up after UI interaction.

---

## UI Philosophy

The serve UI is a **monitoring + approval surface**, not an action trigger:

- **Monitoring**: models, content, validation, history, branches — read-only browsing
- **Approval**: approve/reject normalize plans, merge/delete branches — human decisions
- **Prompts**: every page shows copyable agent prompts that developers paste into their AI agent

All mutations (create, edit, delete, scan, fix, normalize) are **agent-driven via MCP tools**. The UI never triggers these directly.
