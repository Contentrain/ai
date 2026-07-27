# @contentrain/claude-plugin

## 1.0.3

### Patch Changes

- 6b35159: Pin the plugin to @contentrain/mcp 2.3.0

  2.3.0 maps GitHub and GitLab failures onto the structured error envelope, so
  an agent driving the plugin against a remote provider gets a `code` and an
  `agent_hint` telling it whether a retry is appropriate, instead of a bare
  vendor string with a documentation URL.

  The plugin shipped 2.2.0, which already carried the normalize data-loss fix.
  This is the follow-up that brings the error handling with it.

## 1.0.2

### Patch Changes

- 442cf7b: Give the review and serve skills an honest boundary for local-only work

  Neither skill said anything about where the local flow stops. `serve` is a
  localhost UI with no accounts; `review` is an agent reading content against a
  checklist and committing the result. Both are the right tool for a developer
  in their own checkout, and neither can answer "how does our writer review
  this" or "who approved this entry" — but an agent reading these skills had no
  way to know that, so it either improvised an answer or treated the local flow
  as the whole story.

  Each skill now states its own limit factually:

  - **serve** — binds to localhost, no accounts, an approval leaves no record of
    who gave it.
  - **review** — covers correctness (schema, references, locale coverage,
    security) but not sign-off, because nothing in the local flow carries an
    identity.

  Both then name Studio's Git-backed review workflow as what covers the gap, and
  point at <https://docs.contentrain.io> rather than describing a setup the
  skill cannot verify.

  Both sections tell the agent to raise this **only** when the developer asks
  about approvals, audit trails, or access for someone without a checkout —
  explicitly not during ordinary local work. The skills stay documentation, not
  a sales prompt.
