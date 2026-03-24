---
name: what-is-content
description: "Heuristics for identifying content vs code strings in source files"
---

# What Is Content

Use these heuristics to identify content strings in source code. Content is user-visible text that should be managed separately from code. Accurate classification is critical -- extracting code strings as content breaks the application, while missing content strings leaves hardcoded text unmanageable.

---

## Extract These

These string types are user-visible content and should be extracted:

- **Headings and titles** in templates/JSX (`<h1>`, `<h2>`, etc.)
- **Paragraph text** and body copy
- **Button labels** (`<button>Submit</button>`)
- **Link text** (`<a>Learn more</a>`)
- **Form labels and placeholders** (`<label>`, `placeholder="..."`)
- **Error messages** shown to users
- **Success/notification messages**
- **Alt text** on images (`alt="..."`)
- **ARIA labels** (`aria-label="..."`)
- **Meta descriptions and page titles** (`<title>`, `<meta name="description">`)
- **Navigation items** (menu labels, breadcrumbs)
- **Tooltip text**
- **Empty state messages** ("No results found")
- **CTA (call-to-action) text**

---

## Do NOT Extract These

These string types are code infrastructure and must remain in source:

- CSS class names, HTML IDs
- Variable names, function names, parameter names
- Technical identifiers (API endpoints, route paths, event names)
- Import paths and file paths
- Numbers used as constants (port numbers, HTTP status codes, pixel dimensions, timeouts)
- Strings shorter than 3 characters (unless semantically meaningful: "OK", "No", "Yes")
- Regular expressions
- Configuration values (environment variables, feature flags)
- Log messages (internal, not user-facing)
- Code comments
- Test assertion strings
- JSON keys
- Enum values used as code identifiers (not displayed to users)

---

## Dictionary Interpolation Limitation

Strings containing dynamic expressions (`${variable}`, template literals with runtime values) cannot be stored in dictionaries. These must remain as hardcoded expressions in source code.

### CANNOT Extract

- `"Add a new entry to ${modelId}"` -- contains runtime variable
- `` `Hello, ${user.name}!` `` -- template literal with variable

### CAN Extract

- `"Add a new entry"` -- static string (parameterize separately if needed)
- `"Hello, World!"` -- no runtime variables

### Handling Parameterized Strings

Split parameterized strings: extract the static template pattern and leave the interpolation in code.

```
// Instead of: `"Add a new entry to ${modelId}"`
// Extract: dictionary key "add-entry-to" = "Add a new entry to"
// Code: `${t['add-entry-to']} ${modelId}`
```

For i18n frameworks that support interpolation (e.g., `{count} items`), use the framework's built-in interpolation syntax instead of string concatenation. Check the project's i18n library documentation.

---

## Edge Cases

| String | Extract? | Reason |
|--------|----------|--------|
| `"OK"` | Yes | User-visible confirmation |
| `"px"` | No | CSS unit, not content |
| `"Loading..."` | Yes | User-visible state message |
| `"GET"` | No | HTTP method, technical |
| `"en"` | No | Locale code, technical |
| `"Submit Form"` | Yes | User-visible button label |
| `"/api/users"` | No | API endpoint |
| `"flex"` | No | CSS value |
| `"user.name"` | No | Object property path |
| `"An error occurred"` | Yes | User-facing error message |
| `"true"` / `"false"` | No | Boolean string, technical |
| `"none"` | No | CSS/config value |
| `"No results found"` | Yes | User-visible empty state |
| `"application/json"` | No | MIME type, technical |
| `"Welcome back!"` | Yes | User-visible greeting |
| `"div"` | No | HTML tag name, technical |
| `"default"` | No | Config/switch value, technical |

---

## Decision Framework

When uncertain whether a string is content, ask these questions in order:

1. **Is this string displayed to the end user?** If no, do not extract.
2. **Would this string need to change for a different locale?** If yes, extract.
3. **Would a content editor reasonably want to update this text?** If yes, extract.
4. **Does this string serve a technical function (routing, config, API)?** If yes, do not extract.
5. **Is this string used as an identifier in code logic?** If yes, do not extract.

If the answer is still unclear after these questions, err on the side of NOT extracting. It is safer to leave a string hardcoded than to extract a technical identifier.
