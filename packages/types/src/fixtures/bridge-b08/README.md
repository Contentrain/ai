# Bridge B-08 fixture

Output of `Contentrain/wordpress-bridge` `feat/b08-hardcoded-text@1648d2f`
(`tests/text.sh`, local Docker fixture). Owned by the Bridge; copied here
unchanged so the types are checked against what the producer actually emits.

- `hardcoded-text.json`: the Bridge's `bridge/hardcoded-text.json`, byte for
  byte — 96 candidates covering all ten kinds, 201 occurrences, two errors
  (a source over 2 MiB and an unreachable render state), and one secret,
  already redacted by the producer.

The Bridge's `tools/prepare-migrate.mjs` carries it as `RawIR.hardcoded_text`.
