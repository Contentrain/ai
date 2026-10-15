---
"@contentrain/decide": patch
---

The Anthropic provider builds its request for the model it asks. Before Claude 4.7, nothing changes: `temperature: 0` and one forced tool call, the same request bytes and request-shape hash as before. Claude 4.7 and later models return HTTP 400 for a non-default `temperature`, and Opus and Sonnet 5.5 for a forced tool call, so they are asked through structured outputs (a JSON schema) and the answer is read from the text block. The default model is unchanged.
