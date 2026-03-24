---
"@contentrain/rules": minor
"@contentrain/skills": minor
"contentrain": minor
---

feat(rules,skills,cli): migrate to Agent Skills standard format

**@contentrain/rules:**
- Add `essential/contentrain-essentials.md` — compact always-loaded guardrails (~86 lines)
- Remove `ide/` directory and `scripts/build-rules.ts` (IDE-specific build system)
- Replace `ALL_SHARED_RULES`, `IDE_RULE_FILES` exports with `ESSENTIAL_RULES_FILE`
- Always-loaded context reduced from 2,945 lines to 86 lines (97% reduction)

**@contentrain/skills:**
- Add `skills/` directory with 15 Agent Skills (SKILL.md + references/) following agentskills.io standard
- Add `AGENT_SKILLS` catalog export for Tier 1 discovery (name + description)
- New `contentrain-sdk` skill for @contentrain/query usage (local + CDN)
- Existing `workflows/` and `frameworks/` kept for backward compatibility

**contentrain (CLI):**
- Rewrite `installRules()` with generic IDE installer supporting Claude Code, Cursor, Windsurf, and GitHub Copilot
- Install one compact essential guardrails file per IDE (always-loaded) + Agent Skills directories (on-demand)
- Automatic cleanup of old granular rule files from previous versions
