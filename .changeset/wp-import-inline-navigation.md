---
'@contentrain/wp-import': minor
---

`fetchRestRawIR` reads inline navigation: a navigation block in a template part that carries its own links (Twenty Twenty-Five's footer columns) becomes a menu of that part's area (`Footer navigation 1`, `2`, …; a navigation's `ariaLabel` names it), with its links in order and nested, and the same fail-closed rule for links to content not proven public. Only template parts a template uses count (`/wp/v2/templates`; without them, the part named after its area): a theme's unused alternatives (`footer-columns`, `header-large-title`) no longer lend locations or menus. A `#` link stays `#`. Inline menus have no WordPress record: they get negative ids and the store claims no `wp_id` for them.
