# Skill: Diagnose Project Health with `contentrain doctor`

> Run health checks and turn failures into actionable fixes.

---

## When to Use

Use this when:

- setup seems broken
- generated client may be stale
- Git/content structure may be inconsistent
- the user asks "what is wrong with this project?"

---

## Steps

### 1. Run `contentrain doctor`

Use the CLI health check as the first diagnostic pass.

### 2. Group Findings

Interpret failures by category:

- Git problems
- missing `.contentrain/` structure
- bad config/model parsing
- orphan content
- too many pending branches
- stale SDK client

### 3. Fix in Priority Order

Recommended order:

1. Git / initialization blockers
2. config/model parse failures
3. orphan content or missing paths
4. branch pressure
5. stale generated client

### 4. Apply the Correct Follow-up

- not initialized → `contentrain init`
- stale client → `contentrain generate`
- branch pressure → `contentrain diff`
- invalid content/model state → `contentrain validate`

### 5. Re-run Doctor

After changes, run `contentrain doctor` again to confirm the project is healthy.

