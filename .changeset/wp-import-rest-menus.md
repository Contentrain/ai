---
'@contentrain/wp-import': minor
'@contentrain/types': minor
---

`fetchRestRawIR` reads menus. With an Application Password it fills `RawIR.menus` from classic menus (`/wp/v2/menus`, `/wp/v2/menu-items`) and from a block theme's published `wp_navigation` posts, so a REST import of a block-theme site no longer arrives with an empty header navigation. Each menu carries `locations`: the theme locations a classic menu is assigned to, or the template-part areas (`header`, `footer`) that show a block navigation.

Menus need `edit_theme_options`. When they cannot be read — no credential, a rejected one, or a user without that right — the new `gaps` field of the result contains `menus_require_auth` instead of the import silently returning no menus.

`@contentrain/types`: `RawMenu.locations?: string[]` (optional; producers that do not know leave it out). A block navigation's items, which have no WordPress id, carry negative ids.
