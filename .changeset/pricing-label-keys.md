---
"@contentrain/astro-kit": patch
---

Pricing names an interface string for every label it prints. `featuredLabel`, `includedLabel`, `notIncludedLabel`, `billingMainLabel`, `billingAltLabel`, `billingLegend` and `wasLabel` each name their key (`pricing.featured`, `pricing.included`, `pricing.not_included`, `pricing.billing_main`, `pricing.billing_alt`, `pricing.billing_legend`, `pricing.was`) in the catalog. A tool that wires labels from the catalog can now pass them in the site's language; before, a Turkish site showed "Most popular" and "Monthly / Yearly" in English. The starter's dictionary gains `pricing.was` in every language it ships.
