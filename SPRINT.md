# Sprint Plan — contentrain-ai

> Spec-driven development. Her sprint sonunda çalışan, test edilmiş, yayınlanabilir paket(ler).

---

## Sprint 1 — Foundation & Types
**Hedef:** Monorepo çalışır durumda + @contentrain/types tam implementasyon

- [x] Monorepo iskeleti (pnpm workspace, tsconfig, LICENSE, .npmrc)
- [x] @contentrain/types — Tüm type'lar (schema-architecture.md v2.1'den)
  - [x] Field types (27 flat type enum + FieldDef)
  - [x] Model types (ModelDef, 4 kind)
  - [x] Config types (ConfigJson, LocaleConfig)
  - [x] Meta types (EntryMeta, status enum)
  - [x] Context types (ContextJson)
  - [x] Vocabulary & Assets types
  - [x] Validation types (ValidationResult, ValidationError)
- [x] Vitest setup + types unit testleri (39 type-level test)
- [x] oxlint config (.oxlintrc.json)
- [x] lefthook setup (lint + typecheck on commit)
- [x] İlk build doğrulama: `pnpm build` tüm paketlerde başarılı

---

## Sprint 2 — MCP Core Infrastructure
**Hedef:** MCP server ayağa kalkar, ilk 2 read-only tool çalışır

- [x] MCP server boilerplate (@modelcontextprotocol/sdk + stdio transport)
- [x] Tool registration altyapısı (her tool ayrı modül)
- [x] `contentrain_status` tool implementasyonu
- [x] `contentrain_describe` tool implementasyonu
- [x] Canonical JSON serializer utility
- [x] Test: mock .contentrain/ dizininde status + describe çalışır (18 test)

---

## Sprint 3 — MCP Setup Tools ✅
**Hedef:** Yeni proje init edilebilir, model oluşturulabilir

- [x] `contentrain_init` — stack detection + scaffold + git init
- [x] `contentrain_scaffold` — 7 template (blog, landing, docs, ecommerce, saas, i18n, mobile)
- [x] `contentrain_model_save` — model oluşturma/güncelleme + validation
- [x] `contentrain_model_delete` — model silme + referans kontrolü
- [x] Git worktree + branch yönetimi (simple-git, remote-aware)
- [x] context.json güncelleme mekanizması
- [x] Test: init → scaffold → model_save → status akışı (19 yeni test, 37 toplam)

---

## Sprint 4 — MCP Content Tools ✅
**Hedef:** İçerik CRUD tam çalışır (4 kind destekli)

- [x] `contentrain_content_save` — 4 kind desteği (singleton/collection/document/dictionary)
- [x] `contentrain_content_delete` — entry silme + meta temizliği
- [x] `contentrain_content_list` — filtreleme, pagination, relation resolving
- [x] Object-map storage (collection) — sorted keys, canonical serialization
- [x] Meta dosya yönetimi (status, source, updated_by) — meta-manager.ts
- [x] i18n dosya yönetimi (locale-based file routing)
- [x] Document frontmatter parser/serializer (zero-dependency)
- [x] Entry ID generator (12-char hex)
- [x] Test: tüm kind'lar için CRUD + i18n senaryoları (35 yeni test, 81 toplam)

---

## Sprint 4.5 — Hardening & content_path ✅
**Hedef:** Sprint 5 öncesi güvenlik, robustness, monorepo, framework path desteği

- [x] Input validation: slug, entry ID, locale format + config-aware locale check
- [x] Agent duplication fix: tüm tool response'lara `status: 'committed'` + açık mesaj
- [x] Tool description'lar güncellendi (do NOT manually edit uyarıları)
- [x] Config null-safety: eksik field'lar safe default ile normalize
- [x] Git merge conflict detection + abort + descriptive error
- [x] Frontmatter CRLF normalization (cross-platform)
- [x] Circular relation protection (visited set)
- [x] Locale-independent sort fix (localeCompare 'en')
- [x] Monorepo stack detection (walks up 5 levels for workspaces)
- [x] Path normalization (resolve for CONTENTRAIN_PROJECT_ROOT)
- [x] `content_path` on ModelDefinition — framework path desteği (document/dictionary/collection/singleton)
- [x] `locale_strategy` — file/suffix/directory/none (JSON + MD)
- [x] content-manager: jsonFilePath + mdFilePath helpers (tüm CRUD content_path-aware)
- [x] model_save tool: content_path + locale_strategy parametreleri
- [x] Test timeout fix (30s for integration tests)
- [x] Test: 72/72 pass, build + typecheck temiz

---

## Sprint 5 — MCP Normalize & Workflow Tools
**Hedef:** Normalize akışı (extraction + reuse) + validation + submit çalışır

### Phase Architecture
- **Phase 1 (Extraction):** scan → agent reasoning → apply(extract) → validate → submit
- **Phase 2 (Reuse):** apply(reuse, step-by-step) → validate → submit
- Agent = zeka katmanı (projeyi analiz, content kararı, domain grouping)
- MCP = deterministic altyapı (string bulma, content yazma, source patching, validation)

### Sprint 5A — Validate + Submit ✅
- [x] `contentrain_validate` — full project validation (schema + ref integrity + i18n parity)
- [x] Validation rule engine (composable validators)
- [x] Auto-fix: structural issues only (sort, orphan meta, missing locale template)
- [x] Secret detection (API keys, tokens, passwords)
- [x] `contentrain_submit` — push contentrain/* branches to remote
- [x] Test: validation senaryoları + submit

### Sprint 5B — Scan Tool ✅
- [x] `contentrain_scan` mode: **graph** — import/component graph builder (project intelligence)
- [x] `contentrain_scan` mode: **candidates** — string extraction + deterministic pre-filtering
- [x] `contentrain_scan` mode: **summary** — project overview stats
- [x] Pre-filter engine (CSS classes, imports, URLs, paths, color codes, identifiers)
- [x] Batching + pagination (limit/offset)
- [x] Dedup (identical strings across files grouped)
- [x] Graph builder: import statement regex parser, file classification (page/component/layout)
- [x] Test: scan tüm modlar + pre-filtering doğruluğu

### Sprint 5C — Apply Tool (Write, yüksek risk) ✅
- [x] `contentrain_apply` mode: **extract** — content-only extraction (source untouched)
- [x] `contentrain_apply` mode: **reuse** — source code patching (agent-provided replacements)
- [x] Dry-run zorunlu (her mode için)
- [x] Review zorunlu (normalize asla auto-merge edilmez)
- [x] Reuse scope: model/domain bazlı (tüm proje tek seferde yasak)
- [x] Source tracking: her extracted content'in kaynak dosya/satır bilgisi
- [x] Test: extract + reuse end-to-end, dry-run preview doğruluğu (15 test)

### Key Design Decisions
- MCP "bu string content mi?" kararını **vermez** — agent verir
- scan tool sadece bulur + filtreler, semantic karar yapmaz
- Extraction ve reuse ayrı fazlar, ayrı branch'ler, ayrı review'lar
- Graph mode ile agent 200 dosya yerine 20 dosyaya odaklanır (token tasarrufu)
- Top 5+ stack desteği: Next.js, Nuxt, React Native/Expo, Node/Nest, Astro, SvelteKit
- Replacement expression'ı agent belirler (stack-aware), MCP bilmez

---

## Sprint 5.5 — SDK: @contentrain/query ✅
**Hedef:** Universal JS/TS content query SDK — Prisma-pattern generated client

### v0.1 Foundation ✅ (2026-03-13)
- [x] Generator pipeline (parallel I/O throughout):
  - [x] config-reader — reads config.json + models + maps content files
  - [x] type-emitter — generates TypeScript declarations from 27 field types
  - [x] data-emitter — canonical JSON, object-map→sorted-array, frontmatter parsing
  - [x] runtime-emitter — inlined runtime classes, per-kind registries, document aggregation
  - [x] package-json — injects `#contentrain` imports into user's package.json
- [x] Runtime (4 model kinds):
  - [x] QueryBuilder — collection queries with where/sort/limit/offset/locale
  - [x] SingletonAccessor — locale-aware singleton access
  - [x] DictionaryAccessor — key-value lookup with locale
  - [x] DocumentQuery — markdown frontmatter + body with bySlug/where/locale
- [x] CLI: `contentrain-query generate [--root <path>]`
- [x] CJS wrapper: async `init()` pattern (no top-level await)
- [x] MCP alignment: path resolution, locale strategies, canonical serialization, slug extraction
- [x] Quality: oxlint 0 warnings, tsc 0 errors, 75 tests (10 files: runtime + generator + integration)

### v0.2 Relations & Watch ✅ (2026-03-13)
- [x] Relation resolution (one-to-one via `relation`, one-to-many via `relations`)
- [x] Polymorphic relation desteği (`model: string[]` — tries each target model)
- [x] `include(...fields)` method on QueryBuilder and DocumentQuery
- [x] Relation metadata generation in runtime-emitter (field→target model mapping)
- [x] `_resolveEntry` helper — searches collection + document registries
- [x] Graceful degradation: unresolved IDs stay as raw strings
- [x] Watch mode: `contentrain-query generate --watch` (fs.watch + debounce)
- [x] Test fixtures with relation models (author, tag) + content
- [x] Quality: oxlint 0, tsc 0, 96 tests (10 files)

### Key Design Decisions
- Output: `.contentrain/client/` (proje-içi, node_modules'e yazmaz)
- Import: `package.json` `imports` field (`#contentrain`) — Node.js native, tüm bundler'larda plugin'siz
- Dual format: ESM (`.mjs`) + CJS (`.cjs` async init)
- Zero runtime dependency — inlined classes, no node_modules import
- Document dosya naming: `modelId--slug.locale.mjs` (registry'de locale bazlı array aggregation)
- Canonical JSON: sorted keys, 2-space indent (MCP `canonicalStringify` ile hizalı)

---

## Sprint 6 — CLI

### Phase 1 — Core CLI (MCP Orkestrasyon) ✅ (2026-03-13)
**Hedef:** `npx contentrain <command>` — MCP'yi daha akıllı çalıştıran orkestrasyon katmanı

- [x] MCP subpath exports (core/*, util/*, server, templates) — CLI doğrudan import eder
- [x] `contentrain init` — interactive init (stack detect, locales, domains, template, scan preview)
- [x] `contentrain status` — rich overview (models, i18n %, pending branches, validation)
- [x] `contentrain doctor` — health check (git, structure, orphans, SDK freshness, Node ≥22)
- [x] `contentrain validate` — interactive validation (--fix, --interactive, --json, --model)
- [x] `contentrain normalize` — guided flow (graph→scan→approve→extract→reuse)
- [x] `contentrain serve` — MCP stdio server (env propagation, git author)
- [x] `contentrain generate` — SDK client generation (--watch)
- [x] `contentrain diff` — review pending contentrain branches (merge/reject)
- [x] Test: 16 tests (context utils, command module loading, args validation)
- [x] Quality gates: oxlint 0, tsc 0, vitest 16/16

### Phase 2 — CLI UI (TODO)
- [ ] @contentrain/ui setup (shadcn-vue + Contentrain design tokens)
- [ ] `contentrain serve` localhost UI — Vue 3.5 + Vite + h3 backend
  - [ ] Dashboard: proje health, model stats, i18n completion, activity timeline
  - [ ] Content Explorer: model list, entry table, inline edit, locale switcher
  - [ ] Normalize Studio: graph viz, side-by-side source/string view, bulk approve
  - [ ] Validation Dashboard: issue list, one-click fix, i18n parity matrix
  - [ ] Branch Review: visual diff, merge/reject UI
- [ ] `contentrain connect` — Studio bağlantısı (API key setup)
- [ ] Test: CLI UI e2e integration tests

---

## Sprint 7 — AI Rules ✅ (2026-03-13)
**Hedef:** AI agent'lar için eksiksiz content governance ruleset — tüm IDE'ler desteklenir

### Content Quality Rules (6 shared rule)
- [x] `content-quality.md` — yazım kalitesi, ton, content type pattern'ları, lifecycle
- [x] `seo-rules.md` — title, slug, meta, alt text, OG, structured data
- [x] `i18n-quality.md` — çeviri kalitesi, kültürel adaptasyon, string expansion
- [x] `accessibility-rules.md` — alt text, plain language, heading semantics
- [x] `security-rules.md` — XSS, PII, secrets, sanitization whitelist
- [x] `media-rules.md` — boyutlar, formatlar, dosya boyutları, naming

### Architecture Rules (5 shared rule)
- [x] `content-conventions.md` — .contentrain/ yapısı, formatlar, serialization
- [x] `schema-rules.md` — 27 type, 4 kind, relation'lar, nesting limiti
- [x] `mcp-usage.md` — 13 tool kataloğu, sekanslar, guardrail'ler
- [x] `workflow-rules.md` — Git, branching, auto-merge vs review
- [x] `normalize-rules.md` — iki fazlı extraction/reuse

### IDE Bundles (4 format, auto-generated)
- [x] `rules/claude-code/contentrain.md` — CLAUDE.md'ye eklenebilir format
- [x] `rules/cursor/contentrain.cursorrules` — Cursor rules formatı
- [x] `rules/windsurf/contentrain.md` — Windsurf rules formatı
- [x] `rules/generic/contentrain.md` — Universal format (Copilot, Gemini, Codex, vb.)
- [x] `scripts/build-rules.ts` — shared → IDE bundle merge script

### Prompts (4 dosya)
- [x] `prompts/common.md` — paylaşılan kimlik, prensipler, session startup
- [x] `prompts/generate-mode.md` — yeni proje content oluşturma pipeline
- [x] `prompts/normalize-mode.md` — hardcoded string extraction akışı
- [x] `prompts/review-mode.md` — content review checklist

### Skills (6 Claude Code slash command)
- [x] `contentrain-init` — stack detect → init → context.json → model önerisi
- [x] `contentrain-content` — content oluşturma + kalite kuralları + validate + submit
- [x] `contentrain-normalize` — iki fazlı scan → extract → reuse
- [x] `contentrain-review` — 6 kategori review checklist (quality, SEO, a11y, security, i18n, schema)
- [x] `contentrain-translate` — çeviri akışı + vocabulary alignment + kültürel adaptasyon
- [x] `contentrain-generate` — SDK client generation + import doğrulama + usage örnekleri

### Framework Guides (4 dosya)
- [x] `frameworks/nuxt.md` — Nuxt 3: composables, @nuxtjs/i18n, static generation
- [x] `frameworks/next.md` — Next.js 14+: RSC, App Router, next-intl, MDX
- [x] `frameworks/astro.md` — Astro: content collections, islands architecture
- [x] `frameworks/sveltekit.md` — SvelteKit: load functions, $lib, mdsvex

### Context Bridge (5 dosya)
- [x] `context/context-bridge.md` — context.json specification
- [x] `context/templates/nuxt.context.json` — Nuxt template
- [x] `context/templates/next.context.json` — Next.js template
- [x] `context/templates/astro.context.json` — Astro template
- [x] `context/templates/sveltekit.context.json` — SvelteKit template

### Programmatic API + Tests
- [x] `src/index.ts` — FIELD_TYPES (27), MODEL_KINDS (4), MCP_TOOLS (13), rule/skill/framework constants
- [x] Tests: 72 test (validate-rules + validate-prompts)
- [x] Quality: oxlint 0, tsc 0, vitest 72/72

> **Not:** Rules ve skills, codebase tamamlandığında (Sprint 8 sonrası) kapsamlı review yapılarak
> eksik/güncel olmayan kurallar güncellenecek. CLI entegrasyonu (contentrain init --rules) Sprint 6
> Phase 2'de eklenecek.

---

## Sprint 8 — Documentation & Release
**Hedef:** Docs siteleri + npm publish + v1.0.0

- [ ] docs/mcp/ — VitePress site (mcp.contentrain.io)
- [ ] docs/ai/ — VitePress site (ai.contentrain.io)
- [ ] README.md (root + her paket)
- [ ] CHANGELOG.md setup
- [ ] npm publish pipeline
- [ ] GitHub Actions CI (lint + test + build)
- [ ] v1.0.0 tag

---

## MCP Hardening (Post-Review)
**Hedef:** Tüm MCP review bulgularından sonra test altyapısını güçlendirmek

### Test Kalitesi İyileştirme
- [ ] Senaryo bazlı integration testler (happy path değil, edge case odaklı)
  - init→cancel→re-init, normalize auto-merge projede review zorunluluğu
  - writeContext sonrası repo clean mi, content_path'li model CRUD
  - document slug relation, multiline scan, stale branch submit
- [ ] Spec "MUST/MUST NOT" kuralları → doğrudan test assertion'a dönüştür
  - "normalize asla auto-merge edilmez" → test: auto-merge projede normalize → pending-review
  - "writeContext transaction içinde olmalı" → test: tx sonrası git status clean
  - "content_path kullanılıyorsa validator da aynı path'e bakmalı" → test
- [ ] PR öncesi MCP checklist oluştur:
  - [ ] Transaction sonrası repo clean mi?
  - [ ] writeContext nerede çağrılıyor?
  - [ ] Path resolver kullanılıyor mu (hardcoded path var mı)?
  - [ ] Yeni tool/feature spec ile cross-check edildi mi?
- [ ] Mevcut testlerdeki workaround'ları temizle (apply.test.ts post-context commit vb.)

---

## Notlar

- Her sprint sonunda `pnpm build && pnpm test && pnpm lint` geçmeli
- Sprint 1-2 arası geçiş: types paketi stable olmalı, MCP onun üzerine inşa edilecek
- Sprint 3-5 MCP tool'ları spec sırasıyla ilerler: setup → content → workflow
- Spec referansları: `docs/internal/` altındaki dosyalar her zaman source of truth
- Rules & skills codebase stabilize olduktan sonra review edilecek — CLI init komutu rules inject edecek
