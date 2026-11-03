---
"@contentrain/mcp": patch
---

Multi-tenant HTTP mode answers a request carrying an unknown `Mcp-Session-Id` (expired, or minted before a restart) with `404 Session not found`, as the Streamable HTTP spec requires, so the client re-initializes. It used to fall through to a fresh transport and answer `400 Server not initialized`, which clients do not recover from: after every restart each connected client stayed broken until it reconnected by hand.
