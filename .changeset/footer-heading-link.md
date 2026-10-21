---
"@contentrain/types": minor
"@contentrain/wp-import": minor
"@contentrain/astro-kit": minor
---

A footer column's heading can be a link, as the site printed it (a Beaver footer's `<h2><a href="/services/">OUR SERVICES</a></h2>`): `RawMenu.titleHref`, beside `title`. The importer writes it to the menu entry as `title_href` and adds a `title_href` ("Heading link", url) field to the menus model only when a source printed a linked heading; an address with no heading is dropped. The kit Footer's `columns[].titleHref` draws the heading as a link to it, in the heading's own colour; the starter reads it from the menu entry. A plain heading renders as before.
