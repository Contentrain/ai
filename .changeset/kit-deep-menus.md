---
"@contentrain/astro-kit": minor
---

`nav` keeps every level of a menu: the flyout, the new `menu="mega"` column panel (also a `menu` variant on `header`) and the narrow-screen menu all draw the third level and deeper as real links, and an entry with no real link (empty href or `#`) is a disclosure button or a label, not `<a href="#">`. Each parent button has `aria-controls`; a small script, only when a menu has submenus, keeps `aria-expanded` true and lets Escape close a panel and return focus.
