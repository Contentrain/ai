---
"@contentrain/types": minor
---

`RawIR` gains optional `integrations` (`RawIntegration[]`): the outside services a WordPress site is connected to, such as analytics, CRM, newsletter, captcha, CDN and embeds. Each service comes with its evidence, `reconnect_required` and `secret_present`. The evidence never contains a value: it names a plugin, a setting, a script host, a form's wiring or an embed host. `secret_present` is only a boolean. New exports: `RawIntegrationScan` (the bridge's `integrations.json`), `INTEGRATION_CATEGORIES`, `INTEGRATION_EVIDENCE_KINDS`, and `IntegrationReconnectRequiredIssue`, the `integration_reconnect_required` intake/handoff issue that lists every service to connect again. The shape is checked against the Bridge's own output, committed as fixtures.
