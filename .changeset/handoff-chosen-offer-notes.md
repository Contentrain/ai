---
'@contentrain/types': minor
---

`HandoffOffer.chosen` (optional, `true`): the offer the order chose for its capability, at most one per capability; a reader shows it and hides the alternatives the customer turned down. Absent on every offer of a capability = no choice recorded. `MIGRATION_HANDOFF_GOLDEN` marks the chosen offers and its `notes` keep only the customer's lines: the verdict line and the measurement telemetry (visual fidelity, counts, runtime addresses, store media, editability, family generality, component mount points) are gone, as Migrate no longer writes them. A reader that showed `notes` verbatim shows only customer text now.
