---
'@contentrain/emitter-astro': patch
---

The emitted forms and comments runtime handles Studio's `402 payment_required`: the widget empties and hides itself, whether loading, submitting or loading more comments, shows the visitor nothing, doesn't retry, and leaves one `console.debug` note for the workspace owner. `EmbedError` now carries the API's `data.code`, and `isPaymentRequired()` checks it. Other failures are shown as before.
