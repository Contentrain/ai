---
"@contentrain/mcp": minor
---

Map GitHub and GitLab failures onto Contentrain's structured error envelope

The remote providers rethrew raw SDK rejections. Local git paths produce
errors carrying `code`, `agent_hint`, and `developer_action`, but an Octokit
or Gitbeaker failure reached the client as the vendor's own string — a
documentation URL, sometimes an embedded JSON response body, and nothing to
tell the caller whether the operation was worth retrying. An agent seeing
`"Resource not accessible by integration - https://docs.github.com/..."` has
no way to distinguish a permission problem it must report from a conflict it
should retry.

Provider rejections are now mapped at the same boundary that already
normalises local git errors, so every provider error is covered — including
ones added later — without touching the nine `throw` sites in the providers:

| Code | HTTP |
|---|---|
| `PROVIDER_UNAUTHORIZED` | 401 |
| `PROVIDER_FORBIDDEN` | 403 |
| `PROVIDER_RATE_LIMITED` | 403 with an exhausted quota header, 429 |
| `PROVIDER_NOT_FOUND` | 404 |
| `PROVIDER_CONFLICT` | 409 |
| `PROVIDER_VALIDATION_FAILED` | 422 |
| `PROVIDER_UNAVAILABLE` | 5xx |
| `PROVIDER_REQUEST_FAILED` | anything else |

Each carries an `agent_hint` stating whether a retry is appropriate. The
vendor text is preserved as a parenthetical detail — it holds the only
specifics available ("Reference already exists") — with documentation URLs
stripped and the length capped so an embedded response body cannot dominate
the response.

Rate limiting is detected from the `x-ratelimit-remaining` header before
falling back to the message, so a genuine permission 403 is not misreported
as a rate limit. Errors already carrying a Contentrain code keep it, and
local git errors are unchanged.

`extractHttpStatus` and `mapProviderError` are exported from the shared
provider module; `isNotFoundError` keeps its behaviour and is now built on
`extractHttpStatus`.
