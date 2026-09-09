---
"@contentrain/emitter-astro": minor
---

Runtime components are mounted and wired, not merely emitted

Comments and forms used to come out as `<cr-component>` placeholder files that
nothing imported. Now a `<!--@@component:ID@@-->` marker in the body chrome is
a mount point: the family layout imports the component, splits the rendered
chrome at the marker (`splitComponents` in the emitted `fill.ts`) and renders
the component there with the placement's variant. Single pages hand the layout
their entry address (`EmitPost.entry`), and it travels to every mounted
component.

With `input.runtime` (`RuntimeBinding`), `comments` and `form` components get
real implementations: `<cr-comments>` / `<cr-form>` custom elements carrying
the binding, plus `src/lib/embed.ts` — a zero-dependency browser client of the
provider's public forms and comments API (the same contract as
`@contentrain/query/cdn`), rendering the thread, the reply form and the model's
exposed fields, with honeypot and Turnstile per config. Only approved comments
render; pending ones stay on the provider. No credential is emitted.

Without a binding, or a form without a model, the component stays a
placeholder and a warning names it. A marker with no definition is dropped
with a warning; a placement with no marker is warned; header/footer chrome is
not a mount point. `src/data/runtime.json` carries the binding.

The emitted runtime is executed by this package's tests from disk against the
same request/response fixtures the SDK clients are tested with, and compiled
by tsc under Astro's strict settings, so what ships is what was verified.
