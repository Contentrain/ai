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
**Hedef:** Normalize akışı + validation + submit çalışır

- [ ] `contentrain_scan` — hardcoded string detection (AST-based)
- [ ] `contentrain_apply` — scan sonuçlarını content'e dönüştürme
- [ ] `contentrain_validate` — full project validation (schema + ref integrity + i18n parity)
- [ ] `contentrain_submit` — branch push + workflow trigger (auto-merge / review)
- [ ] Validation rule engine (composable validators)
- [ ] Test: normalize akışı end-to-end + validation senaryoları

---

## Sprint 6 — CLI
**Hedef:** `npx contentrain` CLI çalışır

- [ ] `contentrain init` — interactive init (citty prompts)
- [ ] `contentrain serve` — local MCP server başlatma
- [ ] `contentrain validate` — CLI üzerinden validation
- [ ] `contentrain normalize` — scan + apply CLI wrapper
- [ ] `contentrain connect` — Studio bağlantısı (API key setup)
- [ ] Test: CLI komutları e2e

---

## Sprint 7 — AI Rules & Nuxt SDK
**Hedef:** AI rules paketi + Nuxt SDK yayınlanabilir

- [ ] @contentrain/ai-rules
  - [ ] CLAUDE.md template (contentrain projeler için)
  - [ ] .cursorrules template
  - [ ] Windsurf rules template
  - [ ] Rule generator (stack-aware)
- [ ] @contentrain/sdk-nuxt
  - [ ] `useContentrain()` composable
  - [ ] `useFetch` wrapper'ları (model-aware, locale-aware)
  - [ ] Auto-import setup (Nuxt module)
  - [ ] Type-safe content access (model → TypeScript type generation)

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

## Notlar

- Her sprint sonunda `pnpm build && pnpm test && pnpm lint` geçmeli
- Sprint 1-2 arası geçiş: types paketi stable olmalı, MCP onun üzerine inşa edilecek
- Sprint 3-5 MCP tool'ları spec sırasıyla ilerler: setup → content → workflow
- Spec referansları: `docs/internal/` altındaki dosyalar her zaman source of truth
