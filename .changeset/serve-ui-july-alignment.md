---
"contentrain": patch
---

fix(cli): restore blank Serve UI labels and correct the capabilities transport badge

The Serve UI's Doctor and Format sidebar labels rendered blank. Two causes, both fixed:

- **Stale generated client.** The committed `#contentrain` client the UI bundles was last generated in March and had drifted 40 keys behind the source `serve-ui-texts` dictionary — including the two nav labels, the entire Doctor page copy (21 keys), the branch-detail merge-preview strings (7), and the Format page (4). Regenerating brings the client current (and also syncs the docs/marketing content the same client mirrors via `content_path`).
- **Half-migrated sidebar.** `PrimarySidebar` used a `primary-nav.*` namespace for only Doctor/Format while the other six items were hardcoded. All eight nav items now use the single, complete `primary-sidebar.*` namespace, matching `MobileNav`'s dictionary-driven approach.

Also: `/api/capabilities` reported `transport: "stdio"` in Web-UI mode, where the dashboard is actually reached over HTTP (the MCP engine is embedded in-process). The badge now reads `local · http`. `stdio` remains correct only for `serve --stdio`, which does not serve this UI.
