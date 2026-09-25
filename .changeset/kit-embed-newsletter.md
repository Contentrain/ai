---
'@contentrain/astro-kit': minor
---

Two new components.
- `embed`: a video, map or player loaded on click. It shows a poster link to the provider until then, so nothing is requested from a third party before the click, and YouTube plays from youtube-nocookie.com. Only known providers are framed, matched by exact host.
- `newsletter`: a plain form that posts straight to the list provider (Mailchimp, Kit, MailerLite, Brevo, Buttondown), with no script.

The mapping tables route video, map and newsletter elements to them. `KitJs` gains `vanilla`, for a few lines of dependency-free script.
