---
name: contentrain-init
description: "Initialize a new Contentrain project. Use when setting up .contentrain/ directory, configuring stack and locales, or scaffolding templates."
metadata:
  author: Contentrain
  version: "1.0.0"
---

# Skill: Initialize Contentrain in a Project

> Set up Contentrain content infrastructure in an existing project.

---

## When to Use

The user wants to add Contentrain to their project, or says something like "set up contentrain", "initialize contentrain", "add content management".

---

## Steps

### 1. Detect the Tech Stack

Read `package.json` to identify the framework:

| Dependency | Stack |
|---|---|
| `nuxt` | Nuxt 3 |
| `next` | Next.js |
| `@astrojs/astro` or `astro` | Astro |
| `@sveltejs/kit` | SvelteKit |

If none match, treat as a generic Node.js project. Report the detected stack to the user before proceeding.

### 2. Ask for Configuration

Ask the user for:

- **Supported locales:** Which languages will the project support? Default: `["en"]`. Use ISO 639-1 codes.
- **Source locale:** Which locale is the primary/source locale? Default: `"en"`.
- **Domain names:** Suggest domains based on the project structure (e.g., `marketing`, `blog`, `app`, `docs`). Ask the user to confirm or modify.

### 3. Initialize the Project

Call the MCP tool:

```
contentrain_init(stack: "<detected>", locales: ["en", ...], domains: ["marketing", ...])
```

This creates the `.contentrain/` directory structure, `config.json`, and initial `context.json`.

### 4. Analyze Project Conventions

After initialization, review the project for conventions to inform content creation:

- **Tone:** Analyze existing copy in the project (README, landing page, UI text) to determine the appropriate tone (e.g., `professional`, `casual`, `technical`).
- **Naming conventions:** Note any patterns in file naming, component naming, or content structure.

> **Note:** Do NOT manually edit `context.json`. It is managed automatically by MCP tools and updated after every write operation.

### 5. Suggest Initial Models

Based on the project analysis, suggest models that would be useful:

- If the project has a landing page: suggest `hero` (singleton), `features` (singleton or collection).
- If the project has a blog section: suggest `blog-post` (document), `categories` (collection), `authors` (collection).
- If the project has UI text: suggest `ui-labels` (dictionary), `error-messages` (dictionary).

Present suggestions to the user and ask which to create. For selected models, call `contentrain_model_save` for each.

### 6. Offer Scaffold Templates

If the project matches a common pattern, offer to use a scaffold template:

```
contentrain_scaffold(template: "blog", locales: ["en"], with_sample_content: true)
```

Available templates: `blog`, `landing`, `docs`, `ecommerce`, `saas`, `i18n`, `mobile`.

### 7. Set Up Agent Rules

Copy the appropriate rules file to the project:

- For Claude Code projects: append Contentrain rules to the project's `CLAUDE.md` or create a new section.
- For Cursor projects: create or update `.cursorrules` with Contentrain conventions.

Include a reference to the framework-specific guide (nuxt.md, next.md, astro.md, sveltekit.md).

### 8. Final Summary

Report to the user:

- What was created in `.contentrain/`.
- Which models were set up.
- How to import content in their code (show the `#contentrain` import).
- Next steps: create content, run `npx contentrain generate`, start the dev server.
