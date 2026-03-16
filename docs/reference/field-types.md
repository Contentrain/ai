---
title: Field Types
description: Comprehensive reference for all 27 field types including validation rules, constraints, and usage examples
order: 2
slug: field-types
---

# Field Types

Contentrain provides **27 field types** for defining model schemas. Each type includes built-in validation, constraints, and serialization rules.

```ts
type FieldType =
  | 'string' | 'text' | 'email' | 'url' | 'slug' | 'color' | 'phone' | 'code' | 'icon'
  | 'markdown' | 'richtext'
  | 'number' | 'integer' | 'decimal' | 'percent' | 'rating'
  | 'boolean'
  | 'date' | 'datetime'
  | 'image' | 'video' | 'file'
  | 'relation' | 'relations'
  | 'select' | 'array' | 'object'
```

## Field Definition Schema

Every field in a model is defined using the `FieldDef` interface:

```ts
interface FieldDef {
  type: FieldType          // Required: the field type
  required?: boolean       // Validation: must have a value
  unique?: boolean         // Validation: unique within the collection
  default?: unknown        // Default value when not provided
  min?: number             // Minimum (length for strings, value for numbers)
  max?: number             // Maximum (length for strings, value for numbers)
  pattern?: string         // Regex validation pattern
  options?: string[]       // Allowed values (for select type)
  model?: string | string[] // Target model(s) for relation types
  items?: string | FieldDef // Item type for array fields
  fields?: Record<string, FieldDef> // Sub-fields for object type
  accept?: string          // MIME types for media fields
  maxSize?: number         // Max file size in bytes for media fields
  description?: string     // Human-readable field description
}
```

## Complete Field Type Reference

### Text Group

Field types for textual content of varying lengths and formats.

| Type | Description | Constraints | Storage |
|---|---|---|---|
| `string` | Short text, single line | `min`, `max` (length), `pattern` | `string` |
| `text` | Multi-line plain text | `min`, `max` (length) | `string` |
| `email` | Email address | Auto-validated format | `string` |
| `url` | Web URL | Auto-validated format | `string` |
| `slug` | URL-friendly identifier | Lowercase, hyphens, no spaces | `string` |
| `code` | Source code or preformatted text | `min`, `max` (length) | `string` |
| `icon` | Icon identifier (e.g., icon library name) | `pattern`, `options` | `string` |

#### Examples

```json
{
  "title": {
    "type": "string",
    "required": true,
    "min": 1,
    "max": 200
  },
  "bio": {
    "type": "text",
    "max": 1000,
    "description": "Author biography"
  },
  "contact_email": {
    "type": "email",
    "required": true
  },
  "website": {
    "type": "url"
  },
  "post_slug": {
    "type": "slug",
    "required": true,
    "unique": true
  },
  "snippet": {
    "type": "code"
  },
  "category_icon": {
    "type": "icon",
    "options": ["home", "settings", "user", "star"]
  }
}
```

### Rich Content Group

Field types for formatted content with markup.

| Type | Description | Constraints | Storage |
|---|---|---|---|
| `markdown` | Markdown-formatted text | `min`, `max` (length) | `string` |
| `richtext` | HTML/rich text content | `min`, `max` (length) | `string` |

#### Examples

```json
{
  "content": {
    "type": "markdown",
    "required": true,
    "description": "Article body in Markdown format"
  },
  "formatted_bio": {
    "type": "richtext",
    "max": 5000
  }
}
```

::: tip
For document-kind models, use the `body` key in content data for the main Markdown content rather than a `markdown` field. The `markdown` field type is for additional rich text fields within any model kind.
:::

### Numeric Group

Field types for numbers with different precision and display semantics.

| Type | Description | Constraints | Storage |
|---|---|---|---|
| `number` | General number (integer or float) | `min`, `max` (value) | `number` |
| `integer` | Whole number only | `min`, `max` (value) | `number` |
| `decimal` | Floating-point number | `min`, `max` (value) | `number` |
| `percent` | Percentage value (0-100) | `min`, `max` (value, defaults 0-100) | `number` |
| `rating` | Star/score rating | `min`, `max` (value, e.g., 1-5) | `number` |

#### Examples

```json
{
  "price": {
    "type": "decimal",
    "required": true,
    "min": 0
  },
  "quantity": {
    "type": "integer",
    "min": 0,
    "max": 10000,
    "default": 0
  },
  "discount": {
    "type": "percent",
    "min": 0,
    "max": 100
  },
  "user_rating": {
    "type": "rating",
    "min": 1,
    "max": 5
  },
  "sort_order": {
    "type": "number",
    "default": 0
  }
}
```

### Boolean

Simple true/false toggle.

| Type | Description | Constraints | Storage |
|---|---|---|---|
| `boolean` | True or false | `default` | `boolean` |

#### Example

```json
{
  "is_featured": {
    "type": "boolean",
    "default": false
  },
  "published": {
    "type": "boolean",
    "required": true
  }
}
```

### Date/Time Group

Field types for temporal data.

| Type | Description | Constraints | Storage |
|---|---|---|---|
| `date` | Date only (no time) | `min`, `max` (ISO date strings) | `string` (ISO 8601) |
| `datetime` | Full date and time | `min`, `max` (ISO datetime strings) | `string` (ISO 8601) |

#### Examples

```json
{
  "publish_date": {
    "type": "date",
    "required": true
  },
  "event_time": {
    "type": "datetime"
  }
}
```

::: info
Dates are stored as ISO 8601 strings: `"2026-03-15"` for date, `"2026-03-15T14:30:00Z"` for datetime.
:::

### Media Group

Field types for file uploads and media references.

| Type | Description | Constraints | Storage |
|---|---|---|---|
| `image` | Image file reference | `accept`, `maxSize` | `string` (path) |
| `video` | Video file reference | `accept`, `maxSize` | `string` (path) |
| `file` | Generic file reference | `accept`, `maxSize` | `string` (path) |

#### Examples

```json
{
  "cover_image": {
    "type": "image",
    "required": true,
    "accept": "image/png,image/jpeg,image/webp",
    "maxSize": 5242880,
    "description": "Cover image (max 5MB)"
  },
  "intro_video": {
    "type": "video",
    "accept": "video/mp4,video/webm",
    "maxSize": 52428800
  },
  "resume": {
    "type": "file",
    "accept": "application/pdf",
    "maxSize": 10485760
  }
}
```

::: tip
Media paths reference files in the project's `assets_path` (configured in `config.json`). The `accept` field uses standard MIME types.
:::

### Color

Color value field.

| Type | Description | Constraints | Storage |
|---|---|---|---|
| `color` | Color value | `pattern` (e.g., hex format) | `string` |

#### Example

```json
{
  "brand_color": {
    "type": "color",
    "required": true,
    "pattern": "^#[0-9a-fA-F]{6}$",
    "default": "#000000"
  }
}
```

### Phone

Phone number field.

| Type | Description | Constraints | Storage |
|---|---|---|---|
| `phone` | Phone number | `pattern` | `string` |

#### Example

```json
{
  "contact_phone": {
    "type": "phone",
    "pattern": "^\\+[1-9]\\d{1,14}$",
    "description": "E.164 format phone number"
  }
}
```

### Relation Group

Field types for connecting entries across models.

| Type | Description | Constraints | Storage |
|---|---|---|---|
| `relation` | Single relation to another entry | `model` (target model ID) | `string` (entry ID) |
| `relations` | Multiple relations to other entries | `model` (target model ID or array) | `string[]` (entry IDs) |

#### Examples

```json
{
  "author": {
    "type": "relation",
    "required": true,
    "model": "team-members",
    "description": "Post author"
  },
  "tags": {
    "type": "relations",
    "model": "tags",
    "description": "Associated tags"
  },
  "related_content": {
    "type": "relations",
    "model": ["blog-posts", "case-studies"],
    "description": "Related items from multiple collections"
  }
}
```

::: warning
Relation fields store entry IDs as references. Use the `resolve` parameter in `contentrain_content_list` to expand relations to full entry data at query time.
:::

### Complex Group

Field types for structured and compound data.

| Type | Description | Constraints | Storage |
|---|---|---|---|
| `select` | Single choice from predefined options | `options` (required) | `string` |
| `array` | Ordered list of items | `items` (type or FieldDef), `min`, `max` | `array` |
| `object` | Nested object with sub-fields | `fields` (Record of FieldDef) | `object` |

#### Examples

```json
{
  "status": {
    "type": "select",
    "required": true,
    "options": ["active", "inactive", "coming-soon"],
    "default": "active"
  },
  "features": {
    "type": "array",
    "items": "string",
    "min": 1,
    "max": 10,
    "description": "List of feature names"
  },
  "gallery": {
    "type": "array",
    "items": {
      "type": "object",
      "fields": {
        "src": { "type": "image", "required": true },
        "caption": { "type": "string" },
        "alt": { "type": "string", "required": true }
      }
    }
  },
  "seo": {
    "type": "object",
    "fields": {
      "meta_title": { "type": "string", "max": 60 },
      "meta_description": { "type": "text", "max": 160 },
      "og_image": { "type": "image" },
      "no_index": { "type": "boolean", "default": false }
    }
  }
}
```

::: info
The `array` type can hold simple values (`items: "string"`) or complex objects (`items: { type: "object", fields: {...} }`). The `object` type always requires a `fields` definition.
:::

## Complete Type Summary Table

| # | Type | Group | JS Storage | Supports `min`/`max` | Supports `pattern` | Supports `options` | Supports `model` | Supports `items`/`fields` |
|---|---|---|---|---|---|---|---|---|
| 1 | `string` | Text | `string` | Length | Yes | No | No | No |
| 2 | `text` | Text | `string` | Length | No | No | No | No |
| 3 | `email` | Text | `string` | No | Auto | No | No | No |
| 4 | `url` | Text | `string` | No | Auto | No | No | No |
| 5 | `slug` | Text | `string` | Length | Auto | No | No | No |
| 6 | `code` | Text | `string` | Length | No | No | No | No |
| 7 | `icon` | Text | `string` | No | Yes | Yes | No | No |
| 8 | `markdown` | Rich Content | `string` | Length | No | No | No | No |
| 9 | `richtext` | Rich Content | `string` | Length | No | No | No | No |
| 10 | `number` | Numeric | `number` | Value | No | No | No | No |
| 11 | `integer` | Numeric | `number` | Value | No | No | No | No |
| 12 | `decimal` | Numeric | `number` | Value | No | No | No | No |
| 13 | `percent` | Numeric | `number` | Value | No | No | No | No |
| 14 | `rating` | Numeric | `number` | Value | No | No | No | No |
| 15 | `boolean` | Boolean | `boolean` | No | No | No | No | No |
| 16 | `date` | Date/Time | `string` | Date range | No | No | No | No |
| 17 | `datetime` | Date/Time | `string` | Datetime range | No | No | No | No |
| 18 | `image` | Media | `string` | No | No | No | No | No |
| 19 | `video` | Media | `string` | No | No | No | No | No |
| 20 | `file` | Media | `string` | No | No | No | No | No |
| 21 | `color` | Color | `string` | No | Yes | No | No | No |
| 22 | `phone` | Phone | `string` | No | Yes | No | No | No |
| 23 | `relation` | Relation | `string` | No | No | No | Yes | No |
| 24 | `relations` | Relation | `string[]` | No | No | No | Yes | No |
| 25 | `select` | Complex | `string` | No | No | Yes (required) | No | No |
| 26 | `array` | Complex | `array` | Count | No | No | No | `items` |
| 27 | `object` | Complex | `object` | No | No | No | No | `fields` |

## Constraint Properties Reference

| Property | Applicable Types | Description |
|---|---|---|
| `required` | All | Field must have a non-null value |
| `unique` | All (collection only) | Value must be unique across all entries |
| `default` | All | Default value when field is not provided |
| `min` | string, text, code, slug, markdown, richtext, number, integer, decimal, percent, rating, array | Minimum length (strings) or value (numbers) or count (arrays) |
| `max` | string, text, code, slug, markdown, richtext, number, integer, decimal, percent, rating, array | Maximum length (strings) or value (numbers) or count (arrays) |
| `pattern` | string, icon, color, phone | Regular expression for validation |
| `options` | select, icon | Array of allowed string values |
| `model` | relation, relations | Target model ID(s) for the relation |
| `items` | array | Item type: a type name string or a nested `FieldDef` |
| `fields` | object | Sub-field definitions as `Record<string, FieldDef>` |
| `accept` | image, video, file | Comma-separated MIME types |
| `maxSize` | image, video, file | Maximum file size in bytes |
| `description` | All | Human-readable description of the field |
