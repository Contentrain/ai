---
name: security
description: "Security rules: XSS prevention, secret detection, PII handling, URL validation"
---

# Security Rules

These rules are MANDATORY for all AI agents creating or editing content in Contentrain projects.
Content that violates these rules MUST be rejected. These rules protect against XSS, data leaks, and injection attacks.

---

## XSS Prevention in Content

1. `richtext` and `markdown` fields MUST NOT contain any of the following:
   - `<script>` or `</script>` tags
   - `javascript:` protocol in any attribute value
   - Event handler attributes: `onerror`, `onload`, `onclick`, `onmouseover`, `onfocus`, `onblur`, `onsubmit`, `onchange`, `onkeydown`, `onkeyup`, `onkeypress`, `ondblclick`, `onmousedown`, `onmouseup`, `onmousemove`, `onmouseout`, `oncontextmenu`, `ondrag`, `ondrop`, `onpaste`, `oninput`
   - `<iframe>`, `<embed>`, `<object>`, `<applet>`, `<form>`, `<input>`, `<textarea>`, `<select>`, `<button>` tags
   - `data:` URIs containing executable content (e.g., `data:text/html`, `data:application/javascript`)
   - CSS expressions: `expression()`, `url(javascript:)`, `-moz-binding`
   - `<base>` tag (can redirect all relative URLs)
   - `<meta>` tag with `http-equiv="refresh"`
   - `<svg>` with embedded scripts or event handlers

2. **Allowed HTML tags** in richtext fields:
   ```
   p, strong, em, a, ul, ol, li, h2, h3, h4, h5, h6,
   blockquote, code, pre, img, br, hr,
   table, thead, tbody, tr, th, td,
   del, ins, sup, sub, abbr, mark, details, summary
   ```
   Any tag not on this list MUST be stripped or rejected.

3. **Allowed attributes on `<a>` tags**: `href`, `title`, `target`.
   - `href` MUST use `http://`, `https://`, or `mailto:` protocol only.
   - `target` MUST be `_blank` or `_self` only.
   - When `target="_blank"`, the frontend should add `rel="noopener noreferrer"` — but the content itself must not rely on this.

4. **Allowed attributes on `<img>` tags**: `src`, `alt`, `width`, `height`.
   - `src` MUST use `https://`, `http://`, or a relative path starting with `/` or `./`.
   - No `data:` URIs for `src` in production content.

5. Strip or reject all other HTML attributes not explicitly allowed above.

---

## Secret Detection

1. NEVER include any of the following in ANY content field:
   - **API keys**: patterns matching `sk-`, `pk_`, `sk_live_`, `sk_test_`, `api_key=`, `apiKey:`, `x-api-key`
   - **Access tokens**: JWT tokens (`eyJ...`), Bearer tokens, OAuth tokens, session tokens
   - **Passwords or credentials**: any field value resembling `password=`, `passwd:`, `secret=`
   - **Private keys**: `-----BEGIN RSA PRIVATE KEY-----`, `-----BEGIN OPENSSH PRIVATE KEY-----`, `-----BEGIN PGP PRIVATE KEY BLOCK-----`, or similar PEM blocks
   - **Database connection strings**: `mongodb://`, `postgres://`, `mysql://`, `redis://` with credentials
   - **Cloud credentials**: AWS (`AKIA...`), GCP (`AIza...`), Azure storage keys
   - **Webhook URLs with tokens**: URLs containing `token=`, `secret=`, or `/hooks/` with embedded credentials

2. If a field value matches any secret pattern, **reject the value** and warn the user: `"This value appears to contain a secret or credential. Secrets must not be stored in content fields."`

3. Environment-specific values (API endpoints, service IDs) SHOULD use placeholder references (e.g., `{{API_URL}}`) or be stored in environment configuration, not hardcoded in content.

---

## PII Handling

1. **Flag** when email addresses appear in fields that are not typed as `email`. The agent should warn: `"Email address detected in a non-email field. Confirm this is intentional."`

2. **Flag** when phone numbers appear in fields that are not typed as `phone`.

3. **Flag** physical addresses, government ID numbers (SSN, national ID), and dates of birth when they appear in generic `string` or `richtext` fields.

4. User-generated content fields SHOULD be marked for frontend sanitization in the model metadata.

5. NEVER store authentication credentials (usernames, passwords, tokens) in content fields.

---

## URL Validation

1. All URLs in `url` type fields MUST use `https://` protocol.
   - **Exception**: `http://localhost` and `http://127.0.0.1` URLs are allowed for development references.

2. Reject URLs containing path traversal sequences: `../`, `..\\`, `%2e%2e/`, `%2e%2e%5c`.

3. URLs MUST have a valid format: protocol + domain + valid TLD. Reject malformed URLs.

4. Do not use IP-based URLs in production content. Use domain names.
   - **Exception**: private/internal documentation that explicitly references infrastructure IPs.

5. Reject `file://` protocol URLs. Content must never reference local filesystem paths as URLs.

6. Reject `ftp://` protocol URLs unless the content model explicitly documents FTP support.

---

## File & Media Security

1. Media paths MUST be relative to the `assets_path` defined in `config.json`. Never use absolute filesystem paths.

2. Reject any file path containing:
   - Absolute system paths: `/etc/`, `/usr/`, `/var/`, `C:\\`, `C:/`, `/Users/`, `/home/`
   - Path traversal: `../`, `..\\`, `%2e%2e`

3. Validate file extensions match the field type:
   - `image` fields: `.webp`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.avif`
   - `video` fields: `.mp4`, `.webm`, `.ogg`
   - `file` fields: any extension, but **flag executables** and warn the user: `.exe`, `.sh`, `.bat`, `.cmd`, `.ps1`, `.msi`, `.dmg`, `.app`, `.jar`, `.dll`, `.so`

4. File names MUST NOT contain spaces or special characters. Only alphanumeric characters, hyphens (`-`), underscores (`_`), and dots (`.`) are allowed.

5. Reject files with double extensions that disguise executables: `report.pdf.exe`, `image.jpg.sh`.

---

## Content Injection

1. Values in `object` and `array` type fields MUST be valid JSON. Reject values with:
   - Trailing commas
   - JavaScript comments (`//`, `/* */`)
   - Unquoted keys
   - Single-quoted strings
   - Executable code patterns (function declarations, `eval()`, `require()`, `import()`)

2. `code` type fields are displayed as code and never executed, but still apply these rules:
   - No embedded secrets (see Secret Detection above)
   - Content is stored as-is — no sanitization needed beyond secret detection

3. Template literals and interpolation patterns (`${...}`, `{{...}}`, `{%...%}`) in content fields MUST be intentional. Flag unexpected template syntax in plain text fields.

---

## Markdown-Specific

1. Fenced code blocks (`` ``` ``) are rendered as code, not executed. They are safe from an execution standpoint but still subject to secret detection rules.

2. Raw HTML embedded in markdown MUST follow the same XSS rules as richtext fields. Apply the allowed-tags whitelist.

3. Link destinations in markdown (`[text](url)`) MUST use `http://`, `https://`, or `mailto:` protocol only. Reject `javascript:`, `data:`, `vbscript:`, and `file:` protocols.

4. Image sources in markdown (`![alt](src)`) MUST use valid paths:
   - No path traversal (`../`)
   - Valid image extensions (`.webp`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.avif`)
   - `https://` for external images, relative paths for local images

5. Do not allow HTML comments (`<!-- -->`) to hide content in markdown — they may be rendered in some parsers and can be used to smuggle payloads.
