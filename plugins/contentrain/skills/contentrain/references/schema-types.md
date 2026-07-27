---
name: schema-types
description: "Complete 27-type catalog organized by family with field properties, validation rules, and examples."
---

# Schema Types Reference

Contentrain uses a **flat type system** with 27 types. Each type is a single keyword -- no `format` sub-layer. `type: "email"` is the complete specification.

## String Family (11 types)

| Type | Description | Validation | JSON Schema Export |
|------|-------------|------------|-------------------|
| `string` | Single-line text | -- | `{ "type": "string" }` |
| `text` | Multi-line text | -- | `{ "type": "string" }` |
| `email` | Email address | RFC 5321 | `{ "type": "string", "format": "email" }` |
| `url` | URL | RFC 3986 | `{ "type": "string", "format": "uri" }` |
| `slug` | URL-safe identifier | `/^[a-z0-9]+(?:-[a-z0-9]+)*$/` | `{ "type": "string", "pattern": "..." }` |
| `color` | Hex color code | `/^#[0-9a-fA-F]{6}$/` | `{ "type": "string" }` |
| `phone` | Phone number | E.164 or freeform | `{ "type": "string" }` |
| `code` | Code snippet | -- | `{ "type": "string" }` |
| `icon` | Icon identifier | -- | `{ "type": "string" }` |
| `markdown` | Markdown content | -- | `{ "type": "string" }` |
| `richtext` | HTML rich text | -- | `{ "type": "string" }` |

### String Family Examples

```json
"title": { "type": "string", "required": true, "min": 3, "max": 120 }
"bio": { "type": "text", "max": 500 }
"contact_email": { "type": "email", "required": true, "unique": true }
"website": { "type": "url" }
"handle": { "type": "slug", "required": true, "unique": true }
"brand_color": { "type": "color", "default": "#4F46E5" }
"mobile": { "type": "phone" }
"snippet": { "type": "code" }
"logo_icon": { "type": "icon" }
"body": { "type": "markdown", "required": true }
"description": { "type": "richtext" }
```

## Number Family (5 types)

| Type | Description | Constraints | JSON Schema Export |
|------|-------------|-------------|-------------------|
| `number` | General number | -- | `{ "type": "number" }` |
| `integer` | Whole number | -- | `{ "type": "integer" }` |
| `decimal` | Decimal number | -- | `{ "type": "number" }` |
| `percent` | Percentage | 0-100 | `{ "type": "number", "minimum": 0, "maximum": 100 }` |
| `rating` | Rating score | 1-5 | `{ "type": "integer", "minimum": 1, "maximum": 5 }` |

### Number Family Examples

```json
"price": { "type": "decimal", "required": true, "min": 0 }
"quantity": { "type": "integer", "min": 0, "max": 10000 }
"discount": { "type": "percent" }
"score": { "type": "rating", "required": true }
"weight": { "type": "number" }
```

## Primitives (3 types)

| Type | Storage Format | JSON Schema Export |
|------|---------------|-------------------|
| `boolean` | `true` / `false` | `{ "type": "boolean" }` |
| `date` | `"YYYY-MM-DD"` string | `{ "type": "string", "format": "date" }` |
| `datetime` | ISO 8601 string | `{ "type": "string", "format": "date-time" }` |

### Primitives Examples

```json
"is_featured": { "type": "boolean", "default": false }
"publish_date": { "type": "date", "required": true }
"event_start": { "type": "datetime", "required": true }
```

## Media (3 types)

| Type | Storage | Description |
|------|---------|-------------|
| `image` | Relative path (string) | Image file reference |
| `video` | Relative path (string) | Video file reference |
| `file` | Relative path (string) | Generic file reference |

In v1, media fields store URL/path strings only. Upload and processing are out of scope.

### Media Examples

```json
"avatar": { "type": "image", "accept": "image/png,image/jpeg,image/webp", "maxSize": 2097152 }
"intro_video": { "type": "video", "accept": "video/mp4,video/webm" }
"resume": { "type": "file", "accept": "application/pdf" }
```

## Relations (2 types)

| Type | Cardinality | Storage |
|------|-------------|---------|
| `relation` | One-to-one | `"entry-id"` (string) |
| `relations` | One-to-many | `["id-1", "id-2"]` (string array) |

### Relation Examples

```json
"author": { "type": "relation", "model": "team-members", "required": true }
"categories": { "type": "relations", "model": "categories" }
"related_content": { "type": "relation", "model": ["blog-post", "page"] }
"parent": { "type": "relation", "model": "categories" }
```

## Structural (3 types)

| Type | Description | Requires |
|------|-------------|----------|
| `select` | Fixed options, pick one | `options` property |
| `array` | Ordered list of items | `items` property |
| `object` | Nested key-value structure | `fields` property |

### Structural Examples

```json
"status": { "type": "select", "options": ["draft", "published", "archived"], "default": "draft" }

"tags": { "type": "array", "items": "string", "min": 1, "max": 10 }

"variants": {
  "type": "array",
  "items": {
    "type": "object",
    "fields": {
      "color": { "type": "color", "required": true },
      "price": { "type": "decimal", "required": true },
      "size": { "type": "select", "options": ["S", "M", "L"] }
    }
  },
  "max": 50
}

"address": {
  "type": "object",
  "fields": {
    "city": { "type": "string", "required": true },
    "street": { "type": "string", "required": true },
    "zip": { "type": "string" }
  }
}
```

## Field Properties Reference

| Property | Applicable Types | Description |
|----------|-----------------|-------------|
| `type` | ALL | **Required.** One of the 27 types |
| `required` | ALL | Mark field as mandatory. Default: `false`. Omit if `false` |
| `unique` | `string`, `email`, `slug`, `integer` | Enforce uniqueness within model. Default: `false`. Omit if `false` |
| `default` | ALL | Default value. Omit if `null` |
| `min` | string/text: char count; numbers: value; array: element count | Minimum constraint |
| `max` | Same as `min` | Maximum constraint |
| `pattern` | `string`, `text`, `code` | Regex validation pattern |
| `options` | `select` ONLY | Fixed choices: `["draft", "published", "archived"]` |
| `model` | `relation`, `relations` ONLY | Target model ID. String or string array for polymorphic |
| `items` | `array` ONLY | Element type: `"string"` or `{ "type": "object", "fields": {...} }` |
| `fields` | `object` ONLY | Nested field definitions |
| `accept` | `image`, `video`, `file` | Allowed MIME types: `"image/png,image/jpeg"` |
| `maxSize` | `image`, `video`, `file` | Maximum file size in bytes |
| `description` | ALL | Human-readable hint (shown in Studio UI tooltip, used as agent context) |

## Omission Rules

These rules produce minimal, clean schema definitions:

- If `required` is `false` (the default), do NOT include it
- If `unique` is `false` (the default), do NOT include it
- If `default` is `null`, do NOT include it
- Only include properties that add information
- Fewer properties = fewer tokens = faster agent processing
