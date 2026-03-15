# Context Bridge — `.contentrain/context.json` Specification

## Purpose

`context.json` is the project intelligence file. It provides AI agents and Contentrain Studio with structured knowledge about the project: its tech stack, content patterns, conventions, and normalize configuration.

- **Written by:** MCP tools (updated after every write operation)
- **Read by:** AI agents (at the start of every session) and Studio (for UI configuration)
- **Location:** `.contentrain/context.json`

---

## Agent Reading Protocol

Follow this exact sequence when starting any session:

```
1. config.json      — Project configuration (stack, locales, workflow, domains)
2. context.json     — Project intelligence (conventions, scan settings, content patterns)
3. vocabulary.json  — Canonical terms, brand terms, forbidden terms
4. models/          — Model definitions (contentrain_status provides a summary)
5. content/         — Existing content (contentrain_describe provides samples)
```

### When `context.json` Does Not Exist

If the file does not exist, use defaults from `config.json`:
- `stack`: from `config.json > stack`
- `locales`: from `config.json > locales`
- `tone`: default to `"professional"`
- `scan_dirs`: default to `["src"]` or `["."]` depending on stack
- `scan_extensions`: default to framework-appropriate extensions

### Override Priority

`context.json` values take priority over static rule defaults. For example:
- If `context.json > conventions.max_title_length` is set to `80`, use `80` instead of the default `60` from `content-quality.md`.
- If `context.json > conventions.allowed_richtext_tags` is defined, use that list instead of the default from `security-rules.md`.
- Static rules are the fallback when `context.json` does not specify a value.

---

## Schema

```json
{
  "version": 1,
  "project": {
    "name": "my-project",
    "description": "Project description for agent context",
    "stack": "nuxt",
    "stack_version": "3.x",
    "package_manager": "pnpm",
    "src_dir": ".",
    "content_consumption": "build-time"
  },
  "content": {
    "import_pattern": "import {model} from '~/.contentrain/content/{domain}/{model}/{locale}.json'",
    "i18n_strategy": "file-per-locale",
    "default_locale": "en",
    "supported_locales": ["en", "tr"],
    "domains": [
      {
        "id": "marketing",
        "description": "Landing page content",
        "models": ["hero", "features", "pricing"]
      },
      {
        "id": "blog",
        "description": "Blog posts and categories",
        "models": ["blog-post", "categories"]
      }
    ]
  },
  "normalize": {
    "scan_dirs": ["components", "pages", "layouts"],
    "scan_extensions": [".vue", ".ts"],
    "ignore_patterns": ["node_modules", ".nuxt", "dist", ".contentrain"],
    "import_rewrite": "import { t } from '~/composables/useContent'"
  },
  "conventions": {
    "tone": "Professional, concise. Avoid jargon.",
    "brand_terms": {
      "product_name": "Acme Platform",
      "company_name": "Acme Inc"
    },
    "forbidden_terms": ["click here", "lorem ipsum", "TODO"],
    "max_title_length": 80,
    "max_description_length": 160,
    "target_reading_level": "grade-8",
    "allowed_richtext_tags": [
      "p", "strong", "em", "a", "ul", "ol", "li",
      "h2", "h3", "h4", "h5", "h6",
      "blockquote", "code", "pre", "img", "br", "hr",
      "table", "thead", "tbody", "tr", "th", "td",
      "del", "ins", "sup", "sub", "abbr", "mark",
      "details", "summary"
    ]
  },
  "lastOperation": {
    "tool": "content_save",
    "model": "blog-post",
    "locale": "en",
    "entries": ["a1b2c3d4e5f6"],
    "timestamp": "2026-03-11T14:30:00Z",
    "source": "mcp-local"
  },
  "stats": {
    "models": 5,
    "entries": 142,
    "locales": ["en", "tr"],
    "lastSync": "2026-03-11T14:30:00Z"
  }
}
```

---

## Field Reference

### `version` (number)

Schema version. Currently `1`. Incremented on breaking schema changes.

### `project` (object)

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Project name. Used in branch names and commit messages. |
| `description` | string | Brief description for agent context. Helps agents understand the project purpose. |
| `stack` | string | Framework: `nuxt`, `next`, `astro`, `sveltekit`, `react`, `vue`, `node`. |
| `stack_version` | string | Framework version: `"3.x"`, `"14.x"`, `"4.x"`. Affects API patterns. |
| `package_manager` | string | `npm`, `pnpm`, `yarn`, `bun`. Affects install commands in suggestions. |
| `src_dir` | string | Source directory relative to project root. `"."` for Nuxt, `"src"` for most others. |
| `content_consumption` | string | How content is consumed: `"build-time"`, `"runtime"`, `"hybrid"`. |

### `content` (object)

| Field | Type | Description |
|-------|------|-------------|
| `import_pattern` | string | Content import template with `{model}`, `{domain}`, `{locale}` placeholders. |
| `i18n_strategy` | string | Localization strategy: `"file-per-locale"` or `"single-file"`. |
| `default_locale` | string | Default locale code (ISO 639-1): `"en"`, `"tr"`, `"de"`. |
| `supported_locales` | string[] | All supported locale codes. |
| `domains` | object[] | Content domain definitions. Each has `id` (string), `description` (string), and `models` (string[]). |

### `normalize` (object)

| Field | Type | Description |
|-------|------|-------------|
| `scan_dirs` | string[] | Directories to scan for hardcoded strings (relative to project root). |
| `scan_extensions` | string[] | File extensions to include in scan. |
| `ignore_patterns` | string[] | Glob patterns to exclude from scanning. |
| `import_rewrite` | string | Import statement used when rewriting source files after normalization. |

### `conventions` (object)

| Field | Type | Description |
|-------|------|-------------|
| `tone` | string | Content tone: `"professional"`, `"casual"`, `"technical"`, `"friendly"`, `"formal"`. |
| `brand_terms` | object | Key-value pairs of brand terms that must be used with exact casing and spelling. |
| `forbidden_terms` | string[] | Terms that must never appear in content. |
| `max_title_length` | number | Override for maximum title character count. Default: `60`. |
| `max_description_length` | number | Override for maximum description character count. Default: `160`. |
| `target_reading_level` | string | Target readability: `"grade-6"`, `"grade-8"`, `"grade-10"`, `"technical"`. |
| `allowed_richtext_tags` | string[] | Override for allowed HTML tags in richtext fields. |

### `lastOperation` (object)

Updated after every MCP write operation. Agents can use this to understand what changed most recently.

| Field | Type | Description |
|-------|------|-------------|
| `tool` | string | MCP tool that performed the operation: `"content_save"`, `"model_save"`, `"scaffold"`, `"apply"`. |
| `model` | string | Model ID that was affected. |
| `locale` | string | Locale of the operation (if applicable). |
| `entries` | string[] | Entry IDs that were created or modified. |
| `timestamp` | string | ISO 8601 timestamp of the operation. |
| `source` | string | Origin: `"mcp-local"` (IDE), `"mcp-studio"` (Studio server-side MCP), `"studio-ui"` (Studio direct). |

### `stats` (object)

Aggregate project statistics, updated after every write operation.

| Field | Type | Description |
|-------|------|-------------|
| `models` | number | Total number of models in the project. |
| `entries` | number | Total number of content entries across all models and locales. |
| `locales` | string[] | All locales that have content. |
| `lastSync` | string | ISO 8601 timestamp of the last sync operation. |

---

## Stack-Specific Defaults

When creating `context.json` for the first time, use stack-appropriate defaults. See template files in `context/templates/` for each supported stack:

| Stack | Template | `src_dir` | `scan_extensions` | `scan_dirs` |
|-------|----------|-----------|-------------------|-------------|
| Nuxt | `nuxt.context.json` | `"app/"` | `[".vue", ".ts"]` | `["app/components/", "app/pages/", "app/layouts/"]` |
| Next.js | `next.context.json` | `"src/"` | `[".tsx", ".ts", ".jsx"]` | `["src/components/", "src/app/"]` |
| Astro | `astro.context.json` | `"src/"` | `[".astro", ".ts", ".tsx"]` | `["src/components/", "src/pages/", "src/layouts/"]` |
| SvelteKit | `sveltekit.context.json` | `"src/"` | `[".svelte", ".ts"]` | `["src/lib/", "src/routes/"]` |

---

## Update Behavior

MCP tools update `context.json` after every write operation:
- `contentrain_init` creates the initial file
- `contentrain_model_save` updates the domains list if a new domain is used
- `contentrain_content_save` updates content stats
- `contentrain_apply` updates normalize state
- `contentrain_submit` updates last operation timestamp

Agents MUST NOT write to `context.json` directly. It is managed exclusively by MCP tools. Agents read it for configuration and intelligence.

---

## Example: Reading Context in an Agent Session

```
1. Agent receives user request: "Add a blog post about deployment"
2. Agent reads config.json:
   - stack: "nuxt"
   - locales: ["en", "tr"]
   - workflow: "review"
3. Agent reads context.json:
   - tone: "professional"
   - i18n_strategy: "@nuxtjs/i18n"
   - domains: ["blog", "marketing"]
4. Agent reads vocabulary.json:
   - brand_terms: ["Contentrain"]
   - forbidden_terms: ["click here"]
5. Agent calls contentrain_status:
   - Models: blog-post (document), categories (collection), authors (collection)
6. Agent calls contentrain_describe(model: "blog-post"):
   - Fields: title (string, required), slug (slug, required, unique), excerpt (text), ...
7. Agent creates content following all rules, using vocabulary terms, matching tone
8. Agent validates and submits
```
