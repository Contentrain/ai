---
'@contentrain/astro-kit': minor
---

Pricing gains period notes for its billing toggle. Each plan can have `priceWas` / `priceWasAlt` (a struck original price before the price, read as "Was …"), `priceNote` / `priceNoteAlt` (one line under the price) and `priceFoot` / `priceFootAlt` (one line above the button). The section can have `billingAltNote` (a line by the toggle shown only with its second option). The Alt values swap with `priceAlt` the same way, with no script. Each line is printed only where it is given, so a pricing section without them renders as before. A new `wasLabel` ('Was') names the struck price for screen readers.
