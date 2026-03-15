# Skill: Review the Project with `contentrain serve`

> Start the local viewer/review UI and use it intentionally.

---

## When to Use

Use this when:

- the user wants a visual review surface
- validation, normalize, branch review, or content browsing is easier in UI form
- the user wants local MCP stdio vs web UI explained

---

## Steps

### 1. Choose the Mode

- `contentrain serve` → local web UI
- `contentrain serve --stdio` → MCP stdio transport for IDE integration

Use web UI for humans. Use `--stdio` for tool transport.

### 2. Start the Web UI

Run:

```bash
contentrain serve
```

Optional flags:

- `--port`
- `--host`
- `--open=false`

### 3. Use the Right Page for the Job

- Dashboard: overall project state
- Models / Content: inspect schemas and entries
- Validate: check validation results and quick fixes
- Normalize: inspect extraction/reuse review data
- Branches: review pending branches and merges

### 4. Prefer UI for Review-heavy Work

Recommend the web UI when:

- branch review is needed
- normalize source traces or patch previews matter
- validation findings need visual scanning

### 5. Report the Outcome

Summarize:

- which mode was started
- URL and port
- what page the user should open next

