---
"@contentrain/verify": patch
---

`indexing.noindex` and `identity.canonical-mismatch` read the baseline. A page the old site already kept out of search, or already canonicalized to the same target (for example a syndicated post pointing at its original), was the source's decision, and it was reported as a migration error whatever the baseline said. These are now reported as `info` with the message "… as on the baseline — kept". A noindex or a foreign canonical that the old page did not have is still an error, and so is every case without a baseline. In-site canonicals are compared by path, so the same decision carries over from the old origin to the new one.
