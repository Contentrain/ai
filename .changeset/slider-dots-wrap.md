---
"@contentrain/astro-kit": patch
---

A slider's dots wrap instead of widening the row. With one 24px target per slide, 14 dots (336px) between a text-card row's two 44px arrows outgrew a 390px phone: Previous sat at -29px, Next at 375–419px, and the page scrolled sideways (x07's G-interaction `slider_stuck` at 390). The kit visual now checks on a 390 phone that the page is no wider than the screen and that every control of a 14-slide text-card slider lies on it.
