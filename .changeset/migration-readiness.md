---
"@contentrain/types": minor
"@contentrain/emitter-astro": minor
"@contentrain/wp-import": minor
"@contentrain/mcp": patch
"@contentrain/rules": patch
"@contentrain/skills": patch
---

Migration readiness: what the first real WordPress run through the pipeline asked for

**Emitter — `EmittedPost.terms` accepts `{ name, link }` (customer-visible fix).**
A theme whose term list links each term feeds a repeat block objects, and the
emitted `fill.ts` typed `terms` as `string[]` — `astro build` passed but the
generated project's own `npm run build` (`astro check && astro build`) failed
on the page that reads the data. `terms` is now `Array<string | { name, link? }>`;
`term{n}` and `terms` marks print the name either way, repeat blocks read
`item_name` / `item_link`, and `postMarks` normalizes strings so a template
written for names keeps working when the producer starts sending objects.

**Emitter — component markers inside content bodies mount too.** A contact
form usually lives in a page's `post_content`, not in the chrome. A
`<!--@@component:ID@@-->` marker found in a post body now enters the mount
table of the family that renders that collection, so the layout imports the
component and mounts it at the marker exactly as it does for chrome markers.
A body marker with no definition is warned once per family. Route literals may
carry Unicode; `.` / `..` segments are rejected.

**Emitter docs — `src/data/runtime.json` can be rewritten alone.** Components
read the binding from that file only, so binding a project id later needs no
re-emit.

**Types — `ModelDefinition.form` / `.comments`, `MODEL_EXTENSION_KEYS`.** The
runtime provider's public form and comments settings live in the model file;
the content engine carries them verbatim. `MODEL_FIELD_ORDER` places them last.

**MCP — `contentrain_model_save` preserves `form` and `comments`.** The tool
rebuilt the definition from its own input, so an agent adding one field
silently switched a live contact form off. Existing blocks are carried forward
on update and named in `preserved_blocks`. `contentrain_validate` accepts a
model file that carries them (it already did; now tested).

**wp-import — `concurrency` and `maxPages` on `fetchRestRawIR`.** All pages of
every collection were requested in one `Promise.all` (~150 simultaneous
requests on a mid-size site). One pool now bounds requests across collections
(default 4, slot held until the body is consumed), `maxPages` caps each
collection and names what was skipped, failed pages are warned rather than
dropped silently. `SKIP_TYPES` gains GeneratePress / GenerateBlocks / Elementor
template types and Contact Form 7 / WPForms form definitions — design, not
content. ACF field records stay: their cross-model parents are part of the
lossless import.

**Rules & skills — schema, MCP-usage and mapping references name the preserved blocks and the newly skipped post types** (the parity tests hold the docs to the code).
