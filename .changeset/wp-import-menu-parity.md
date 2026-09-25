---
'@contentrain/wp-import': minor
---

Menu items that name a public post or term point at its public address (the post's or term's `link`), not the address the block or menu item kept: a block stores the url it had when it was saved, and a typed `?page_id=` is a form the migrated site cannot serve. `MenuContext` gains optional `postLink` / `termLink`. A typed `?page_id=` / `?p=` link counts as this site's with or without a leading `www.`, over either scheme, as the Bridge reads it. `fixtures/menu-parity.json` (`contentrain-menu-parity@1`) is the menu parity fixture the Bridge copies; `rest-menus.parity.test.ts` runs wp-import's side.
