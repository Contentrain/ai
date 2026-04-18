---
name: content-quality
description: "Detailed content writing rules: structure, tone, content type patterns, lifecycle"
---

# Content Quality Rules

These rules govern how AI agents create and edit content in Contentrain projects.
Every rule is mandatory. Violations must be fixed before committing.

---

## 1. Writing Structure

### 1.1 Heading Hierarchy

- Use exactly ONE H1 per page. The H1 is the page/entry title.
- Follow sequential order: H1 -> H2 -> H3 -> H4 -> H5 -> H6.
- NEVER skip levels. An H4 must be preceded by an H3 in the same section.
- Do not use headings for visual styling. A heading implies a content section.

### 1.2 Titles

- Length: 50-60 characters. Measure before committing.
- Place the primary keyword within the first 30 characters.
- Use action-oriented phrasing: "Build a REST API" not "REST API Overview".
- No clickbait: "You Won't Believe..." is forbidden.
- No ALL CAPS titles. Use sentence case or title case per project convention.
- Every title must be unique within its collection.

### 1.3 Excerpts and Descriptions

- Length: 120-160 characters. Must be a complete sentence.
- Summarize the VALUE the reader gets, not the process of writing.
  - GOOD: "Learn how to deploy a Node.js app to production in under 5 minutes."
  - BAD: "This article discusses deployment."
- End with a period. No trailing ellipsis.
- Must differ from the title -- do not repeat the title verbatim.

### 1.4 Body Content

- Prefer active voice. Passive voice is acceptable only when the actor is unknown or irrelevant.
- Target reading grade 8-10 (Flesch-Kincaid). Avoid unnecessarily complex sentences.
- Paragraphs: 3-5 sentences each. Break longer paragraphs.
- Use transition sentences between sections to maintain flow.
- Front-load key information -- most important point first in each paragraph.
- One idea per paragraph. Do not combine unrelated points.

### 1.5 Lists

- Use parallel grammatical structure across all items.
  - GOOD: "Install dependencies", "Configure the server", "Run the tests"
  - BAD: "Install dependencies", "Server configuration", "You should run tests"
- Punctuation: if items are complete sentences, end each with a period. If fragments, no terminal punctuation. Be consistent within a single list.
- Ordered lists for sequential steps. Unordered lists for non-sequential items.
- Minimum 2 items in any list. A single-item list is not a list.

### 1.6 No Placeholder Text

Reject and replace any of the following immediately:

- "Lorem ipsum" or any Latin filler text
- "TODO", "TBD", "FIXME", "XXX" in content fields
- "[insert here]", "[your text]", "[placeholder]"
- "Sample text", "Example content", "Test entry"
- Empty strings in required fields

If the agent cannot produce real content, it must leave the entry in `draft` status and flag the field explicitly. Never commit placeholder text.

### 1.7 No Duplicate Content

- The same text block must not appear in multiple entries within a collection.
- Titles must be unique across all entries in the same collection.
- Descriptions/excerpts must be unique across all entries in the same collection.
- If content is shared across entries, extract it to a referenced entry and use a `relation` field.
- Before writing, query existing entries to confirm no duplication.
- **Dictionary values:** Different keys must not map to identical values. If "Cancel" exists under `dialog.cancel`, do not create `form.cancel` with the same value — reuse the existing key. MCP warns automatically via `advisories` in the save response.
- **Cross-model deduplication:** If the same text appears across multiple dictionary models, consider moving it to a shared dictionary or using vocabulary terms for consistency.

---

## 2. Tone and Voice

### 2.1 Project Tone Configuration

- Read `.contentrain/context.json` -> `conventions.tone` before writing any content.
- If the field exists, match the specified tone exactly.
- If `context.json` does not exist or `conventions.tone` is absent, default to **neutral professional** tone.
- Never override or ignore the configured tone.

### 2.2 Vocabulary Compliance

- Read `.contentrain/vocabulary.json` before writing content.
- Use canonical terms exactly as defined. Never invent synonyms for canonical terms.
  - If vocabulary defines "Sign up", do not write "Register", "Create account", or "Join".
- Respect `brand_terms`: use exact casing and spacing as defined.
  - If brand defines "GitHub", never write "Github", "github", or "GH".
- Respect `forbidden_terms`: never use any term on this list.
- If `vocabulary.json` does not exist, proceed without term constraints but maintain internal consistency -- pick one term and use it everywhere.

### 2.3 Content Type Voice Mapping

Match voice to content type:

| Content Type | Voice | Characteristics |
|---|---|---|
| Marketing / Landing pages | Persuasive | Benefit-focused, confident, action-oriented, second person ("you") |
| Documentation / Guides | Instructional | Step-by-step, precise, imperative mood ("Run the command"), third person for concepts |
| Error messages | Empathetic | Solution-oriented, no blame, explain what happened and what to do next |
| UI labels | Concise | Consistent terminology, sentence case, no articles unless needed for clarity |
| Blog posts | Conversational-professional | Engaging, informative, first person plural ("we") acceptable |
| Changelogs | Factual | Past tense, specific, version-referenced, no marketing language |

### 2.4 Consistency Within an Entry

- Do not shift tone mid-entry. If the opening is formal, maintain formality throughout.
- Do not mix second person ("you") and third person ("the user") within the same entry.
- Maintain consistent use of contractions: either use them throughout or not at all per project tone.

---

## 3. Content Type Patterns

### 3.1 Blog Post (document kind)

Required structure:

1. **Hook opening** (1-2 sentences): State the problem, ask a question, or present a surprising fact.
2. **Context** (1 paragraph): Why this topic matters now.
3. **Scannable body**: Use H2/H3 subheadings every 2-4 paragraphs. Each section is self-contained.
4. **Conclusion** (1 paragraph): Summarize key takeaways.
5. **Call-to-action**: Direct the reader to a next step (related post, product, signup).

Do not start with "In this article, we will discuss..." -- start with value.

### 3.2 Landing Page (singleton kind)

Required sections in order:

1. **Hero statement**: One sentence, max 10 words. State the core value proposition.
2. **Problem**: 2-3 sentences describing the pain point.
3. **Solution**: How the product/service solves it. Benefit-focused, not feature-focused.
4. **Features**: 3-6 features, each with a heading and 1-2 sentence description.
5. **Social proof**: Testimonials, logos, statistics. Must reference real data.
6. **CTA**: Clear, single action. Use action verbs: "Start free trial", "Get started", "Book a demo".

### 3.3 Documentation (document kind)

Required structure:

1. **Prerequisites callout**: List what the reader needs before starting (tools, accounts, knowledge).
2. **Overview** (1-2 sentences): What the reader will accomplish.
3. **Step-by-step instructions**: Numbered steps, one action per step, code blocks where applicable.
4. **Expected result**: What the reader should see/have after completing the steps.
5. **Troubleshooting**: Common errors and their solutions. Minimum 2 items.

Use imperative mood: "Run the command" not "You should run the command".

### 3.4 Error Messages (dictionary kind)

Structure each error message with three parts:

1. **What happened**: State the error clearly. "Your session has expired."
2. **Why**: Brief explanation. "Sessions expire after 30 minutes of inactivity."
3. **How to fix**: Actionable next step. "Sign in again to continue."

Rules:
- No blame language: "Invalid input" not "You entered invalid input".
- No technical jargon in user-facing errors.
- No naked error codes: always pair codes with human-readable text.

### 3.5 Form Labels (dictionary kind)

- Use noun or noun phrase: "Email address", "Password", "Company name".
- Sentence case consistently: "Email address" not "Email Address".
- No colons at the end of labels.
- Helper text: one sentence explaining what to enter or format requirements.
- Consistent phrasing across all forms in the project.

### 3.6 Navigation Items (dictionary kind)

- 1-2 words maximum.
- Use verbs for actions: "Sign in", "Download", "Contact".
- Use nouns for destinations: "Dashboard", "Settings", "Pricing".
- No abbreviations unless universally understood.
- Consistent capitalization: match the project convention.

### 3.7 Notifications (dictionary kind)

- Start with what happened: "Your file has been uploaded."
- Include timestamp context when relevant: "2 minutes ago".
- End with next action if applicable: "View file" or "Dismiss".
- Keep under 100 characters for mobile readability.

---

## 4. Content Lifecycle

### 4.1 Draft Status

- Focus on completeness over polish.
- ALL required fields must have real values -- no placeholders.
- Optional fields may be empty but should be populated when possible.
- Drafts do not need final copy-editing but must be factually correct.
- Flag any fields the agent could not confidently populate.

### 4.2 Review Status

- Vocabulary compliance: every term matches `vocabulary.json`.
- Tone consistency: matches `context.json` -> `conventions.tone` throughout.
- Factual accuracy: all claims, statistics, and references are verifiable.
- Cross-locale coverage: if entry exists in source locale, all target locales must have corresponding entries.
- Field constraint compliance: all values within min/max length, pattern, and type constraints.

### 4.3 Published Status

ALL of the following must be true:

- Every required field is populated with final content.
- Every supported locale has a complete translation.
- Zero placeholder text anywhere in the entry.
- All relation fields reference existing, published entries.
- SEO fields (title, description, slug) are populated and valid.
- Content passes tone and vocabulary checks.

### 4.4 Archive Criteria

Move content to archived status when:

- It references deprecated features, APIs, or products.
- Dates or events referenced are more than 12 months past.
- The content has been superseded by a newer entry.
- Statistics or data points are outdated and cannot be updated.

Never delete content. Archive it. Deletion is a manual human decision.

---

## 5. Contentrain-Specific Rules

### 5.1 System-Managed Fields

NEVER write to these fields -- they are managed by the system:

- `id` -- auto-generated unique identifier
- `createdAt` -- set on creation
- `updatedAt` -- set on every save
- `status` -- managed through workflow transitions
- `order` -- managed through UI reordering

If a write payload includes any system field, remove it before saving.

### 5.2 Metadata Directory

- NEVER write to `.contentrain/meta/` -- all metadata files are system-managed.
- NEVER modify `.contentrain/models/` directly -- use MCP tools.
- Read these directories for context, but treat them as read-only.

### 5.3 Vocabulary Usage

- Load `vocabulary.json` at the start of every content operation.
- Cross-reference every noun, verb, and technical term against the vocabulary.
- If a term is not in the vocabulary but should be, flag it for human review -- do not add it.
- Vocabulary applies across ALL entries, ALL collections, ALL locales.

### 5.4 Model Field Constraints

Before writing any field value:

1. Read the model definition from `.contentrain/models/`.
2. Check `required` -- required fields must have non-empty values.
3. Check `min` / `max` -- string length must be within bounds.
4. Check `pattern` -- value must match regex if defined.
5. Check `unique` -- value must not duplicate any existing entry in the collection.
6. Check `options` -- if the field is an enum/select, value must be from the defined list.

Constraint violations must be fixed before saving. Never save invalid data.

### 5.5 Collection Entry Consistency

- All entries within a collection must follow the same structural pattern.
- If existing entries use a specific content structure (e.g., all blog posts start with a hook), new entries must follow the same pattern.
- Before creating a new entry, read 2-3 existing entries to understand the established pattern.
- If no existing entries exist, follow the content type pattern defined in Section 3.

---

## Validation Checklist

Before committing any content, verify:

- [ ] Heading hierarchy is sequential (H1 -> H2 -> H3, no skips)
- [ ] Title is 50-60 characters, keyword-rich, unique
- [ ] Description is 120-160 characters, complete sentence, unique
- [ ] No placeholder text anywhere
- [ ] No duplicate content across entries
- [ ] Tone matches `context.json` configuration
- [ ] All terms match `vocabulary.json`
- [ ] All field constraints (length, pattern, required) are satisfied
- [ ] Content follows the correct content type pattern
- [ ] System fields are not included in write payload
