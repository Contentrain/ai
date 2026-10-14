---
"@contentrain/astro-kit": patch
---

Two instances of a component on one page no longer share ids. Gallery, Faq, Tabs, Slider, Dialog, Newsletter, Contact form, Contact details, Post list, Nav, Search box, and Band's heading took a fixed default id, so a second instance pointed into the first: clicking an image in the second gallery opened the first one's, a tab or label controlled the other instance, and a dialog opener opened the wrong dialog. Each default is now taken once per page (`gallery`, `gallery-2`, … in render order, the same on every build, and two galleries of the same images included). An id the page gives is kept, and a default steps around it. The kit's visual run now fails a component page with any id twice, or a lightbox button that opens another instance's image.
