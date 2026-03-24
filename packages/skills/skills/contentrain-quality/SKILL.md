---
name: contentrain-quality
description: "Content quality, SEO, accessibility, and media rules for Contentrain projects. Use when reviewing content quality, checking SEO, or validating media assets."
metadata:
  author: Contentrain
  version: "1.0.0"
---

# Contentrain Quality

Quality rules govern how AI agents create, edit, and review content in Contentrain projects. These rules ensure every piece of content meets standards for writing quality, SEO, accessibility, and media optimization before publication.

---

## Quick Checklist

Before committing any content, verify all of the following:

- [ ] Heading hierarchy is sequential (H1 -> H2 -> H3, no skips)
- [ ] Exactly one H1 per page
- [ ] Title is 50-60 characters, primary keyword within first 30 chars, unique
- [ ] Description is 120-160 characters, complete sentence, unique, differs from title
- [ ] No placeholder text anywhere (no Lorem ipsum, TODO, TBD, [insert here])
- [ ] No duplicate content across entries in the same collection
- [ ] Tone matches `context.json > conventions.tone` configuration
- [ ] All terms match `vocabulary.json` (canonical terms, brand terms, no forbidden terms)
- [ ] All field constraints (length, pattern, required, unique) are satisfied
- [ ] Content follows the correct content type pattern (blog, landing page, docs, etc.)
- [ ] System fields (`id`, `createdAt`, `updatedAt`, `status`, `order`) are not in write payload
- [ ] Slug is lowercase, hyphenated, 3-5 words, no special characters
- [ ] All images have descriptive alt text (max 125 chars) or empty string for decorative
- [ ] OG/social fields populated if model supports them
- [ ] Media files follow naming conventions and size limits

---

## Key Writing Rules

### Heading Hierarchy

- Exactly ONE H1 per page (the page/entry title).
- Follow sequential order: H1 -> H2 -> H3 -> H4. Never skip levels.
- Every heading must have content beneath it. No empty sections.

### Titles

- Length: 50-60 characters. Measure before committing.
- Place the primary keyword within the first 30 characters.
- Use action-oriented phrasing: "Build a REST API" not "REST API Overview".
- No clickbait, no ALL CAPS. Every title must be unique within its collection.

### Descriptions and Excerpts

- Length: 120-160 characters. Must be a complete sentence ending with a period.
- Summarize the VALUE the reader gets, not the process of writing.
- Must differ from the title.

### Body Content

- Active voice preferred. Target reading grade 8-10.
- Paragraphs: 3-5 sentences each. One idea per paragraph.
- Front-load key information in each paragraph.

### Lists

- Parallel grammatical structure across all items.
- Ordered lists for sequential steps, unordered for non-sequential items.
- Minimum 2 items in any list.

### Prohibitions

- No placeholder text: Lorem ipsum, TODO, TBD, [insert here], empty required fields.
- No duplicate content: titles, descriptions, and text blocks must be unique within a collection.

---

## Tone Configuration

### Reading Context

Before writing any content, check these files:

1. **`.contentrain/context.json`** -- Read `conventions.tone` and match the specified tone exactly. If absent, default to neutral professional.
2. **`.contentrain/vocabulary.json`** -- Use canonical terms exactly as defined. Respect `brand_terms` casing. Never use `forbidden_terms`. If vocabulary does not exist, maintain internal consistency.

### Content Type Voice Mapping

| Content Type | Voice | Characteristics |
|---|---|---|
| Marketing / Landing pages | Persuasive | Benefit-focused, confident, action-oriented, second person ("you") |
| Documentation / Guides | Instructional | Step-by-step, precise, imperative mood ("Run the command") |
| Error messages | Empathetic | Solution-oriented, no blame, explain what happened and what to do |
| UI labels | Concise | Consistent terminology, sentence case, no articles unless needed |
| Blog posts | Conversational-professional | Engaging, informative, first person plural ("we") acceptable |
| Changelogs | Factual | Past tense, specific, version-referenced, no marketing language |

### Consistency

- Do not shift tone mid-entry.
- Do not mix second person ("you") and third person ("the user") within the same entry.
- Maintain consistent use of contractions per project tone.

---

## Content Lifecycle States

Content moves through four states with specific requirements at each:

### Draft

- Focus on completeness over polish.
- ALL required fields must have real values -- no placeholders.
- Flag any fields the agent could not confidently populate.

### Review

- Vocabulary compliance: every term matches `vocabulary.json`.
- Tone consistency: matches configured tone throughout.
- Factual accuracy: all claims and references are verifiable.
- Cross-locale coverage: all target locales have corresponding entries.
- Field constraint compliance: all values within defined bounds.

### Published

ALL of the following must be true:

- Every required field is populated with final content.
- Every supported locale has a complete translation.
- Zero placeholder text anywhere.
- All relation fields reference existing, published entries.
- SEO fields (title, description, slug) are populated and valid.
- Content passes tone and vocabulary checks.

### Archived

Move content to archived status when:

- It references deprecated features, APIs, or products.
- Dates or events referenced are more than 12 months past.
- The content has been superseded by a newer entry.
- Statistics or data points are outdated and cannot be updated.

Never delete content. Archive it. Deletion is a manual human decision.

---

## Content Type Patterns

### Blog Post (document kind)

Hook opening -> Context paragraph -> Scannable body with H2/H3 -> Conclusion -> CTA. Do not start with "In this article, we will discuss..."

### Landing Page (singleton kind)

Hero statement (max 10 words) -> Problem -> Solution -> Features (3-6) -> Social proof -> CTA.

### Documentation (document kind)

Prerequisites callout -> Overview -> Step-by-step instructions -> Expected result -> Troubleshooting (min 2 items).

### Error Messages (dictionary kind)

What happened -> Why -> How to fix. No blame language, no technical jargon, no naked error codes.

### Form Labels (dictionary kind)

Noun or noun phrase, sentence case, no trailing colons. Helper text: one sentence with format requirements.

### Navigation Items (dictionary kind)

1-2 words maximum. Verbs for actions, nouns for destinations. No abbreviations.

---

## References

- [Content Quality](references/content-quality.md) -- Detailed content writing rules, structure, tone, content type patterns, lifecycle
- [SEO Rules](references/seo.md) -- SEO optimization rules for content fields, meta tags, and structured data
- [Accessibility](references/accessibility.md) -- Accessibility rules for content: alt text, ARIA, color contrast, reading level
- [Media Rules](references/media.md) -- Media asset rules: image optimization, video handling, file naming conventions
