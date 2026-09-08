---
"@contentrain/query": minor
---

Astro content-layer loader — `@contentrain/query/astro`

`contentrainLoader({ model, locale?, root? })` is what `defineCollection({ loader })`
takes, so an Astro site can hold Contentrain content in its own content layer:
`getCollection()`, `getEntry()`, `reference()` and `<Content />` all work.

It reads the same `.contentrain` manifest the client generator reads, so a
project never has two answers about what its content is. Each model kind maps to
the shape Astro can use: collection → one entry per record · document → one entry
per file with markdown in `body`, rendered · dictionary → one entry per key,
because a single blob entry would make `getEntry()` useless on the model that
most needs it · singleton → one entry. Omitting `locale` on an i18n model loads
every language with ids prefixed (`en/my-post`), since Astro ids are unique per
collection.

Astro is not a dependency, not even a peer — the loader is structurally typed,
so any Astro 5 version works and other consumers carry nothing extra.
