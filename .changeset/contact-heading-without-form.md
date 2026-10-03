---
"@contentrain/astro-kit": patch
---

ContactForm keeps the contact section's heading (and introduction) when its form is hidden. #399 left out a section that was down to its heading alone; on a delivery without a form home (a public run) that dropped the source's own heading ("Bize yazın" on endpopcorn /iletisim/) and failed the G-text gate. Only the form goes now; a section with no heading, introduction or details at all is still not drawn.
