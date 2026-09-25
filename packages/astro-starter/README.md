# @contentrain/astro-starter

The Astro + Contentrain starter that a WordPress migration lays down, packaged so that tools can copy it.

```ts
import { cp } from 'node:fs/promises'
import { STARTER_DIR } from '@contentrain/astro-starter'


```

`STARTER_DIR` is the starter's root. It holds:
- `package.json` and its own `pnpm-lock.yaml`;
- `astro.config.mjs`;
- `src/` and `public/`;
- the `.contentrain` store with its models.

The site installs from that lockfile where it lands.

The source is [`templates/astro-starter`](https://github.com/Contentrain/ai/tree/main/templates/astro-starter), which has its own README describing what the starter does. The published package holds a copy of it in `template/`, made at pack time, without build output or dependencies. Inside this monorepo, `STARTER_DIR` points at the source directory.

Every release is gated twice. Before merge, the starter passes `scripts/starter-gates.mjs`: `astro check`, knip, the build and the built-site checks, both empty and with the wp-demo fixture. After a release, the Starter with published packages workflow installs it against what is on npm.
