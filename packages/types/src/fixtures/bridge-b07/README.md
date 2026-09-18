# Bridge B-07 fixtures

Output of `Contentrain/wordpress-bridge` `feat/b07-integrations@31a611e`
(local Docker fixtures). Owned by the Bridge; copied here unchanged so the
types are checked against what the producer actually emits.

- `integrations.json`: `bridge/integrations.json` from `tests/integrations.sh`,
  byte for byte. It has nine services in six categories, with all five evidence
  kinds. Four services have a credential set; one embed needs no reconnection.
- `integrations-none.json`: the same file from a site with no outside
  service (`tests/text.sh`), byte for byte. It is an empty list with the scan
  counts beside it.

The Bridge's `tools/prepare-migrate.mjs` carries `services` as
`RawIR.integrations` and raises one `integration_reconnect_required` issue
listing every service with `reconnect_required: true`.
