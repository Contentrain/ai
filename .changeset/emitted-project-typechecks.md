---
"@contentrain/emitter-astro": patch
---

Emitted projects pass `astro check`, which their own build runs first

Two deterministic failures, both found by building an emitted project rather
than reading it:

- Pages inferred their data type from the JSON file, so a site whose posts
  need no extra route parameters produced a type without `params` and
  `astro check` rejected the page that reads it. The emitted runtime now
  declares `EmittedPost` / `EmittedQueryPage` and pages assert the contract.
  The cast sits inside `getStaticPaths`, which Astro hoists above the
  component scope.
- A list route without a title emitted `page.title ?? "" ?? ''`, which
  `astro check` rejects as never nullish. The fallback chain is built in the
  emitter now.
