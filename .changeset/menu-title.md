---
"@contentrain/types": minor
"@contentrain/wp-import": minor
---

A menu can carry the heading its site prints above it: `RawMenu.title` (a footer column's "Company"). It is not the menu's name, which is only an admin label. The importer writes it to the menu entry and adds a `title` ("Heading") field to the menus model only when a source printed one, so stores without headings stay as they were. The starter prints a footer column's heading only from that field, and a menu without one renders as before.
