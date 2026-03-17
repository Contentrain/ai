# SEO Rules

These rules govern search engine optimization for all content managed through Contentrain.
Apply these rules to every content entry that produces a public-facing page.

---

## 1. Page Titles

### 1.1 Length and Format

- Length: 50-60 characters including spaces. Google truncates titles beyond ~60 characters.
- Measure character count before saving. Truncated titles harm click-through rates.
- No ALL CAPS titles. Use sentence case or title case per project convention.
- No excessive punctuation: no `!!!`, no `???`, no `...` in titles.
- No emoji in titles unless explicitly configured in `context.json`.

### 1.2 Keyword Placement

- Place the primary keyword within the first 30 characters.
- Structure: `Primary Keyword Phrase | Brand Name` or `Primary Keyword Phrase — Brand Name`.
- Acceptable separators: ` | `, ` — `, ` - `. Pick one and use it consistently across all entries.
- The keyword must read naturally — no keyword stuffing.
  - GOOD: "Deploy Node.js to Production | Acme Docs"
  - BAD: "Node.js Deploy Node Production Deployment | Acme"

### 1.3 Uniqueness

- Every entry in a collection MUST have a unique title.
- Before saving, query existing entries and confirm no title collision.
- Titles across collections should also be unique when they produce public pages.

---

## 2. Meta Descriptions

### 2.1 Length and Format

- Length: 120-155 characters including spaces.
- Must be a complete sentence or two short sentences.
- End with a period.
- No keyword stuffing — write for humans, not crawlers.

### 2.2 Content Requirements

- Include a clear value proposition or call-to-action.
  - GOOD: "Learn how to set up CI/CD for your Node.js project in 10 minutes. Step-by-step guide with examples."
  - BAD: "CI/CD Node.js setup guide tutorial deployment continuous integration."
- Must differ from the page title — do not repeat the title as the description.
- Must be unique per entry. No two entries may share the same meta description.

### 2.3 What to Avoid

- No quotes or special characters that break HTML meta tags: avoid `"`, `<`, `>`.
- No "Click here to learn more" — search engines ignore generic CTAs.
- No date references that will become stale (prefer "latest" over "2024").

---

## 3. Slugs

### 3.1 Format

- Lowercase only. No uppercase characters.
- Words separated by hyphens (`-`). No underscores, no spaces, no dots.
- No special characters: only `a-z`, `0-9`, and `-`.
- No consecutive hyphens (`--`). No leading or trailing hyphens.

### 3.2 Length and Content

- Optimal: 3-5 words.
- Maximum: 60 characters.
- Remove stop words (`the`, `a`, `an`, `is`, `of`, `and`, `or`, `in`, `to`) unless removing them changes meaning.
  - "how-to-deploy-node" → "deploy-node" is acceptable.
  - "state-of-the-art" → keep as-is because meaning changes if shortened.

### 3.3 Stability

- NEVER change a slug on a published entry. Changing slugs breaks existing links, bookmarks, and search engine indexing.
- If a slug must change, the human must set up a redirect. The agent must not change published slugs without explicit human instruction.
- Draft entries may have their slugs changed freely before first publication.

### 3.4 Locale Consistency

- Use the same slug value across all locales for the same entry.
- Do NOT translate slugs. Slugs are identifiers, not content.
- Example: the slug `deploy-node` remains `deploy-node` in `en`, `tr`, `de`, and all other locales.

---

## 4. Heading Structure

### 4.1 H1 Rule

- Exactly one H1 per page. The H1 is the entry title or the primary heading.
- The H1 should contain the primary keyword naturally.
- Do not duplicate the H1 text elsewhere on the page.

### 4.2 Subheading Keywords

- Include relevant keywords in H2 and H3 headings where natural.
- Do not force keywords into every heading. Clarity takes priority over keyword density.
- Use question-format headings for FAQ-style content: "How do I reset my password?"

### 4.3 Hierarchy Reflects Content

- Heading levels must reflect the logical structure of the content.
- Do not use H3 because it renders smaller — use CSS for styling, headings for structure.
- Every heading must have content beneath it. No empty sections.
- Do not place two headings consecutively without content between them.

---

## 5. Images and Alt Text

### 5.1 Alt Text Requirements

- Every `image` field that displays on a public page MUST have corresponding alt text.
- Describe the image content and its context: "Dashboard showing monthly revenue chart with 15% growth indicator."
- Maximum length: 125 characters.
- Do not start with "Image of", "Photo of", "Picture of" — describe directly.

### 5.2 Decorative Images

- If an image is purely decorative (visual separator, background pattern), set alt text to an empty string (`""`).
- Do not omit the alt field entirely — explicitly set it to empty.

### 5.3 Keywords in Alt Text

- Include relevant keywords naturally when they describe the image.
- Do not stuff keywords: "Node.js Node deployment Node server Node production" is forbidden.
- The alt text must accurately describe what is in the image.

### 5.4 Image File Names

- When the agent controls the image file name, use descriptive, hyphenated names.
  - GOOD: `revenue-dashboard-chart.png`
  - BAD: `IMG_2847.png`, `screenshot.png`, `image1.png`

---

## 6. Open Graph and Social Media

### 6.1 Open Graph Tags

When OG fields exist in the model, populate them:

| Field | Max Length | Requirement |
|---|---|---|
| `og:title` | 60 characters | Concise version of the page title |
| `og:description` | 200 characters | Slightly longer than meta description, conversational |
| `og:image` | — | 1200x630 pixels recommended, must be absolute URL |
| `og:type` | — | `article` for blog/docs, `website` for landing pages |

### 6.2 Twitter Card

- Use `summary_large_image` for content with strong visual elements.
- Use `summary` for text-focused content.
- Twitter title and description may differ from OG — optimize for each platform.

### 6.3 Fallback

- If OG-specific fields are absent, the system uses the standard title and description.
- Ensure the standard title and description are suitable for social sharing.

---

## 7. Internal Linking

### 7.1 Relation Fields

- Use Contentrain `relation` and `relations` model fields for cross-references between entries.
- Prefer structured relations over hardcoded links in body content.
- Structured relations are maintainable — if a slug changes, relations still resolve.

### 7.2 Bidirectional Relations

- When Entry A references Entry B, check if Entry B should reference Entry A.
- Example: if a blog post links to a product, the product's "related articles" should include that blog post.
- The agent should suggest bidirectional relations but not create them without confirmation.

### 7.3 Manual Links in Body Content

- If the model does not have relation fields and links must be in body text, use relative paths.
- Verify that linked entries exist before saving.
- Do not link to draft or archived entries from published content.

---

## 8. URL and Canonical Rules

### 8.1 Slug Patterns

- All entries in a collection must follow the same slug pattern.
- If existing entries use `verb-noun` format (e.g., `deploy-app`, `configure-server`), new entries must follow the same pattern.
- Check existing entries before generating a slug for a new entry.

### 8.2 Multi-Locale URLs

- Same slug across all locales (see Section 3.4).
- Locale prefix is handled by the frontend routing, not by the content slug.
- Example: `/en/deploy-node` and `/tr/deploy-node` share the slug `deploy-node`.

### 8.3 Trailing Slashes

- The agent does not control trailing slash behavior — this is a frontend routing concern.
- Ensure slug values do not include leading or trailing slashes.

---

## Validation Checklist

Before committing any content with SEO impact, verify:

- [ ] Title is 50-60 characters, primary keyword near start, unique
- [ ] Meta description is 120-155 characters, complete sentence, unique
- [ ] Slug is lowercase, hyphenated, 3-5 words, no special characters
- [ ] Published slugs have not been changed
- [ ] Slugs are identical across all locales for the same entry
- [ ] One H1 per page, sequential heading hierarchy
- [ ] All images have descriptive alt text (max 125 chars) or empty string for decorative
- [ ] OG fields populated if model supports them
- [ ] Relation fields used for internal cross-references
- [ ] No keyword stuffing in titles, descriptions, headings, or alt text
