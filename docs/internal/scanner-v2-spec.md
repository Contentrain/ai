# Scanner v2 Spec: AST-Based Content String Extraction

> **Sürüm:** 1.0
> **Tarih:** 2026-03-14
> **Ref:** mcp-development-spec.md v1.4, schema-architecture.md v2.1

---

## 1. Problem

Current scanner = regex-based. **~80-85% false positive rate.**

| False Positive Category | % | Example |
|---|---|---|
| Tailwind CSS classes | ~45% | `"flex items-center gap-2"` |
| Code/config identifiers | ~25% | `"string"`, `"boolean"`, `"outline"` |
| Git/CLI arguments | ~5% | `"--list"`, `"--stat"` |
| Framework identifiers | ~5% | `"nuxt"`, `"h3"` |
| **Actual UI strings** | **~15-20%** | `"No pending branches"` |

Root cause: regex cannot distinguish syntactic context.

## 2. Solution: AST-Based Parsing

Parse source → AST → classify each string by its AST node context.

### Parser Strategy

| Extension | Parser | Package |
|---|---|---|
| `.tsx`, `.jsx` | TypeScript Compiler API | `typescript` |
| `.ts`, `.js`, `.mjs` | TypeScript Compiler API | `typescript` |
| `.vue` | Vue SFC Compiler | `@vue/compiler-sfc` |
| `.astro` | Astro Compiler | `@astrojs/compiler` |
| `.svelte` | Svelte Compiler | `svelte/compiler` |

All parsers lazy-loaded — only import when file extension encountered.

### AST String Classification

| Role | Confidence | Action | Example |
|---|---|---|---|
| `jsx_text_content` | 0.95 | Extract | `<h1>Build faster</h1>` |
| `jsx_content_attribute` | 0.90 | Extract | `label="Sign Up"`, `placeholder="Email"` |
| `template_text_content` | 0.95 | Extract | Vue/Svelte template text |
| `object_ui_property` | 0.85 | Extract | `{ title: "Welcome" }` |
| `variable_string` | 0.70 | Extract | `const heading = "Welcome"` |
| `function_string_arg` | 0.50 | Extract (medium) | `showError("Failed")` |
| `css_utility_call` | 0.00 | **Skip** | `cn("flex", "items-center")` |
| `jsx_technical_attr` | 0.00 | **Skip** | `className="..."`, `key="..."` |
| `import_specifier` | 0.00 | **Skip** | `import ... from "path"` |
| `type_annotation` | 0.00 | **Skip** | `type Foo = "bar"` |
| `config_property` | 0.00 | **Skip** | `{ type: "string" }` |
| `console_call` | 0.00 | **Skip** | `console.log("debug")` |
| `test_assertion` | 0.00 | **Skip** | `describe("test")` |

### Tailwind Detection (45% Problem → 0%)

Three structural approaches, no regex:

1. **Attribute name**: `className` / `class` → skip value unconditionally
2. **Utility function calls**: `cn()`, `clsx()`, `twMerge()`, `cva()` → skip all string args
3. **Style objects**: `style={{ ... }}` → skip all string values

### Content vs Config Property Names

**Extract** (UI-facing): `title`, `description`, `label`, `message`, `placeholder`, `heading`, `subtitle`, `caption`, `buttonText`, `tooltip`, `hint`, `error`, `warning`, `alt`, `aria-label`

**Skip** (config): `type`, `kind`, `mode`, `status`, `variant`, `size`, `color`, `format`, `encoding`, `method`, `strategy`

## 3. Module Structure

```
packages/mcp/src/core/
├── scanner.ts              → Backward-compat facade
├── ast-scanner/
│   ├── index.ts            → parseAndClassify(filePath, content, ext)
│   ├── types.ts            → ASTStringRole, ClassifiedString, SkipReason
│   ├── parsers/
│   │   ├── tsx-parser.ts   → TSX/JSX/TS/JS
│   │   ├── vue-parser.ts   → Vue SFC
│   │   ├── astro-parser.ts → Astro
│   │   └── svelte-parser.ts→ Svelte
│   ├── classifiers/
│   │   ├── context-classifier.ts → AST node → role + confidence
│   │   └── skip-rules.ts         → Deterministic skip sets
│   └── utils/
│       └── tailwind-detect.ts    → cn/clsx/twMerge detection
```

## 4. Implementation Phases

### Phase 1: Core TSX/JSX Parser (3-4 gün)
- `tsx-parser.ts` + `context-classifier.ts` + `skip-rules.ts` + `tailwind-detect.ts`
- `scanner.ts` entegrasyonu (replace `extractStringsFromFile`)
- Unit tests
- **Impact:** Covers TSX/JSX/TS/JS — majority of projects

### Phase 2: Vue SFC Parser (2 gün)
- `vue-parser.ts` — template AST + script AST
- `@vue/compiler-sfc` dependency
- Unit tests

### Phase 3: Astro + Svelte Parsers (2-3 gün)
- `astro-parser.ts` + `svelte-parser.ts`
- Lazy-loaded dependencies
- Unit tests

### Phase 4: Integration + Cleanup (2 gün)
- Full test suite, integration tests
- Performance benchmarks
- `isNonContent()` as secondary safety net
- Quality gates

## 5. API Compatibility

Public API unchanged:
- `scanCandidates(projectRoot, options)` → `ScanCandidatesResult`
- `scanSummary(projectRoot, options)` → `ScanSummaryResult`
- `ScanCandidate` interface unchanged

## 6. Success Metrics

| Metric | Before | Target |
|---|---|---|
| False positive rate | ~80% | <20% |
| Tailwind CSS false positives | ~45% | 0% |
| Scan performance (500 files) | ~2s | <4s |
| Backward compatibility | — | 100% |

## 7. Dependencies

| Package | Size | When Added | Required? |
|---|---|---|---|
| `typescript` (runtime) | already present | Phase 1 | Yes |
| `@vue/compiler-sfc` | ~2MB | Phase 2 | Only for .vue |
| `@astrojs/compiler` | ~1MB | Phase 3 | Only for .astro |
| `svelte` | ~3MB | Phase 3 | Only for .svelte |

All framework parsers lazy-loaded — zero overhead if not used.
