# `@contentrain/skills`

Workflow skills and framework guides for Contentrain-aware AI agents.

This package is the procedural layer of the Contentrain ecosystem. It tells an agent how to apply the policy from `@contentrain/rules` in concrete tasks such as:

- initializing a project
- creating content
- running normalize
- reviewing and submitting changes
- generating the SDK client
- translating content

If `@contentrain/rules` defines constraints, `@contentrain/skills` defines execution playbooks.

## 🚀 Install

```bash
pnpm add @contentrain/skills
```

## 📦 What It Contains

### Workflow skills

Published under `workflows/*`:

- `contentrain-init.md`
- `contentrain-model.md`
- `contentrain-content.md`
- `contentrain-bulk.md`
- `contentrain-normalize.md`
- `contentrain-validate-fix.md`
- `contentrain-review.md`
- `contentrain-diff.md`
- `contentrain-doctor.md`
- `contentrain-serve.md`
- `contentrain-translate.md`
- `contentrain-generate.md`

### Framework guides

Published under `frameworks/*`:

- `nuxt.md`
- `next.md`
- `astro.md`
- `sveltekit.md`
- `vue.md`
- `react.md`
- `expo.md`
- `react-native.md`
- `node.md`

## 🧰 Public Exports

The package root exports:

- `WORKFLOW_SKILLS`
- `FRAMEWORK_GUIDES`

## 🧪 Example

```ts
import { WORKFLOW_SKILLS, FRAMEWORK_GUIDES } from '@contentrain/skills'

console.log(WORKFLOW_SKILLS)
console.log(FRAMEWORK_GUIDES.includes('next'))
```

## 🧠 Design Role

`@contentrain/skills` is for step-by-step execution guidance:

- `skills` = procedures and operational playbooks
- `rules` = policy and non-negotiable constraints

In practice:

- use `@contentrain/rules` to understand what is allowed
- use `@contentrain/skills` to decide which workflow to run next

## 🔗 Relationship To Other Packages

- `@contentrain/mcp` provides the actual tool surface
- `@contentrain/rules` defines policy and quality constraints
- `contentrain` exposes CLI and serve workflows
- `@contentrain/query` provides the generated content runtime

## 🛠 Build

From the monorepo root:

```bash
pnpm --filter @contentrain/skills build
pnpm --filter @contentrain/skills test
pnpm --filter @contentrain/skills typecheck
```

## 📄 License

MIT
