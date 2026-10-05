---
"@contentrain/emitter-astro": patch
---

Comment threads show an initials monogram beside each comment (`<span class="cr-avatar" aria-hidden="true">`, from `initials()` over the author name). The public API sends no avatar or email hash, so none is fetched. The Astro starter carries the same client and styles the thread with its role tokens.
