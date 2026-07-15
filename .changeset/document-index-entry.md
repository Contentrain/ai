---
"@contentrain/query": major
---

feat(sdk)!: CDN `document().all()` returns index entries, so reading `.body` no longer compiles

On the CDN, `document(model).all()` reads the model's `_index`, which carries
frontmatter only — the body lives in the per-slug document and is reachable via
`bySlug()`. But `all()` was typed `Promise<T[]>`, and the generated document type
declares `body: string`. So `entry.body` type-checked, returned `undefined` at
runtime, and pages rendered their headings and dropped their prose — with no
error, no warning, and a passing typecheck.

The trap is that the bundled runtime's `all()` *does* carry bodies. Code written
and tested against bundled delivery compiled and passed, then quietly rendered
empty on CDN. The two modes genuinely differ in shape, so they no longer share
one return type.

BREAKING: `CdnDocumentQuery.all()` now returns `DocumentIndexEntry<T>[]`
(`Omit<T, 'body'>`), and `first()` returns `DocumentIndexEntry<T> | undefined`.
Reading `.body` off either is now a compile error. Fetch the body with
`bySlug(slug)`, which returns `{ frontmatter, body, html }`. Runtime behaviour is
unchanged — this only makes the types tell the truth about what was already
being returned.

```ts
// before — compiled, rendered nothing
const sections = await client.document<GuideSections>('guide-sections').all()
sections.map(s => renderMarkdown(s.body))   // undefined at runtime

// after — the first line is a compile error; fetch bodies explicitly
const index = await client.document<GuideSections>('guide-sections').all()
const full = await Promise.all(index.map(s => q.bySlug(s.slug)))
full.map(d => renderMarkdown(d!.body))
```

Type-level contracts are now asserted in `*.test-d.ts` via `vitest --typecheck`,
since `tsconfig.json` only covers `src` and never type-checked the tests.
