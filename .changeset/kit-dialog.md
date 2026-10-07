---
"@contentrain/astro-kit": minor
---

New `dialog` section: a popup as a dialog the visitor opens — a button in a section of the page and a native modal `<dialog>` with a heading, rich text and buttons. Nothing opens by itself (no timers, scroll or exit intent). Focus trap, Escape and focus return are the platform's; the button opens it with no script where Invoker Commands exist, a small script covers other browsers and closes on a backdrop click, and with scripting off the content is laid out in the section itself. Variants `triggerStyle`, `size`, `align`, `tone`; takes the measured style. Mapping rules `elementor/popup` (elementor.json 13) and `classic/popup-maker` (classic.json 8) read the popup's title, text and its own buttons (the dialog's actions); `dialog.open` and `dialog.close` join the interface strings in all 16 languages.
