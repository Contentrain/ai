---
title: Forms & Comments
description: "How a statically built Contentrain site keeps working forms and moderated comments — the public embed contract, the emitted runtime components, and the SDK clients that speak the same API"
order: 6
slug: forms-comments
---

# Forms & Comments

A static build has no server, so the two things every content site needs — a contact form and a comment thread — are the first casualties of a migration. Contentrain solves them with one public, unauthenticated API and **two clients that speak it**:

| Door | Who uses it | Ships in |
|---|---|---|
| `<cr-form>` / `<cr-comments>` custom elements | A generated site, with no dependencies | [`@contentrain/emitter-astro`](/packages/emitter-astro) |
| `FormsClient` / `CommentsClient` | An app you are writing yourself | [`@contentrain/query/cdn`](/packages/sdk#cdn-forms) |

Same endpoints, same payloads, same rules. The emitted version inlines its client into `src/lib/embed.ts` precisely so a migrated site depends on nothing but Astro.

## No credential ever travels

These endpoints are called from a visitor's browser, on a page anyone can view.

::: warning A page cannot keep a secret
There is no session and no API key in any of this — by design, not by omission. Studio's CORS for these routes allows only `Content-Type`, so an `Authorization` header would fail the preflight before the request was ever sent.

The emitter never writes a credential into a generated site. If you find yourself wanting to pass one here, the design has gone wrong somewhere upstream.
:::

What the binding carries instead is public information: an origin and a project id.

```json
// src/data/runtime.json — the only place the binding lives
{
  "base_url": "https://studio.contentrain.io",
  "project_id": "proj_…"
}
```

Components read it at build time. When the project id does not exist at emit time — a Studio project created after the migration — write this one file and rebuild. No re-emit, and the component files do not change.

## Forms

```
GET  {base}/{projectId}/{modelId}/config  → FormConfig
POST {base}/{projectId}/{modelId}/submit  → FormSubmitResult
```

A form names a Contentrain model; the model's exposed fields *are* the form.

```ts
const form = client.form()

const config = await form.config('contact')
// { modelId, locale, fields, captcha, captchaSiteKey, successMessage, honeypotField }

const result = await form.submit('contact', { name, email, message }, {
  captchaToken,          // when config.captcha is set
  honeypot: '',          // the hidden input — a human leaves it empty
})
// { success: true, message } · { success: false, errors: [{ field, message }] }
```

`fields` is a **map keyed by field id**, carrying the model's own `FieldDef` shape — so the renderer gets the field type, and validation on the server is the same validation the model already declares. `locale` is the project default: what a submission is validated against and written to.

Submitted values are wrapped in `data` so the control fields (`captchaToken`, `_hp`) can never collide with a model field named `captchaToken`.

### The two spam defences

| Defence | How it behaves |
|---|---|
| Honeypot | `honeypotField` names a hidden input to render and leave empty. A filled one is dropped **silently, server-side** — a bot learns nothing |
| Turnstile | `captcha: 'turnstile'` with a `captchaSiteKey`, when the operator configured one. A failed token comes back as an ordinary field error on `captcha` |

Both follow the project's configuration. Neither is invented by the emitter.

## Comments

```
GET  {base}/{projectId}/{modelId}/{entryId}?locale&page&limit&sort → CommentThread
POST {base}/{projectId}/{modelId}/{entryId}?locale                 → CommentSubmitResult
```

A thread is keyed on the **entry address** — model, entry id, locale — which is exactly what `EmitPost.entry` carries onto each generated page. A translated post has its own thread, because it is its own entry address.

```ts
const comments = client.comments()

const thread = await comments.thread('posts', entryId, {
  locale: 'en', page: 1, limit: 20, sort: 'oldest',
})

const result = await comments.submit('posts', entryId, {
  author: { name, email, url },
  body,
  parentId: thread.comments[0]?.id,   // omit for a root comment
})
// { success: true, status: 'pending' | 'approved', comment }
```

Each comment comes back as `{ id, parentId, depth, author, body, type, createdAt, replies }`, already nested under its root.

::: danger Two rules the renderer must not break
**Only approved comments are returned.** A pending comment lives on the provider and is never in the public response — so a submission answering `status: 'pending'` must tell the visitor their comment is awaiting moderation, not optimistically render it as published.

**`body` is plain text. Render it escaped.** It is visitor-authored content arriving over an unauthenticated endpoint; treating it as markup is a stored-XSS hole with a queue in front of it.
:::

Email, IP, user agent and referrer never leave the server. `author.url` is public and nullable; `author.isModerator` is set when a workspace member wrote the comment from Studio.

The thread's `config` tells the renderer what to draw:

| Field | Effect |
|---|---|
| `closed` | Render the comments, hide the form |
| `requireApproval` | Whether a new comment appears immediately |
| `requireEmail` | Whether the email field is mandatory |
| `maxDepth` | Reply nesting cap for new submissions — `0` is flat |
| `maxBodyLength` | Client-side length limit |
| `captcha` / `captchaSiteKey` | Same Turnstile contract as forms |

## On a migrated site

WordPress comments come across in the import. `contentrain import` writes a `comments-export.json` — a `contentrain-comments@1` payload built from the `RawIR` and the `EntrySourceMap`, because the WP-id → entry-address mapping only exists at conversion time.

That file is an **intake payload for a live comments service**, not a content store. Loading it is what makes the old threads appear under the new pages.

::: warning Comments that point nowhere
The import warns when comments reference posts outside the import — a partial REST import orphans them. Check that warning before loading the export, or those threads land under nothing.
:::

Then, at emit time:

- a `comments` component with a runtime binding becomes `<cr-comments>` on the entry pages
- a `form` component becomes `<cr-form>` and must name its model (`ComponentDef.model`)
- **without a binding — or a form without a model — the component stays a placeholder**, and each one is named in `result.warnings`

A placeholder looks fine in a screenshot. Read the warnings.

## The acceptance test

A migration is not finished because the components render. The gate is the round trip:

> generated site → submit → provider stores it → moderation → public `GET` shows it — **and a pending item is not visible to the public before approval.**

Both halves matter. The second one is the one that is easy to get wrong and expensive to discover later.

## Related Pages

- [Astro Emitter](/packages/emitter-astro) — how components find their mount points
- [Query SDK](/packages/sdk#cdn-forms) — the same clients for an app you are writing
- [WordPress Migration](/guides/migration) — where the comments export comes from
- [Contentrain Studio](/studio) — the provider side: moderation, storage, and the public API
