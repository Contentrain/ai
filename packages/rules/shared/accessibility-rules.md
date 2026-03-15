# Accessibility Rules

These rules are MANDATORY for all AI agents creating or editing content in Contentrain projects.
Violations will be flagged during validation. No exceptions unless explicitly overridden by `context.json` configuration.

---

## Image Accessibility

1. Every `image` type field MUST have a corresponding alt text value. If the model defines an `image_alt` field, populate it. If not, include alt text guidance in the image field's `description` metadata.

2. Alt text MUST describe the image's **content and function**, not its appearance.
   - GOOD: `"CEO Jane Doe speaking at the 2024 product launch"`
   - BAD: `"A photo with blue tones and a person on stage"`

3. Decorative images (visual separators, background textures) MUST have alt text set to an empty string `""`. Never leave alt text undefined or null — explicitly set it to `""`.

4. Complex images (charts, infographics, diagrams) MUST have a short alt text summarizing the conclusion, plus a detailed description in an adjacent text field or in the body content.
   - Example alt: `"Bar chart showing Q3 revenue grew 22% year-over-year"`
   - Example adjacent text: full data table or written summary

5. Alt text MUST NOT exceed **125 characters**. Screen readers may truncate longer text.

6. Icon images used as interactive elements MUST have alt text describing the **action**, not the icon.
   - GOOD: `"Search"`, `"Close menu"`, `"Open settings"`
   - BAD: `"Magnifying glass icon"`, `"X icon"`

7. Do not begin alt text with "Image of" or "Photo of" — the screen reader already announces it as an image.

---

## Language & Readability

1. Target a **grade 8-10 reading level** (Flesch-Kincaid) for general content.

2. Target **grade 6-8** for public-facing critical content: legal notices, safety information, error messages, onboarding flows.

3. Use plain language. Prefer common words over formal synonyms:
   - "use" not "utilize"
   - "start" not "commence"
   - "help" not "facilitate"
   - "buy" not "purchase"
   - "end" not "terminate"

4. Define every acronym and abbreviation on first use: `"Content Management System (CMS)"`. After the first definition, use the acronym freely.

5. Do not use jargon unless the content targets a technical audience. Check `context.json > tone` to determine the audience. When `tone` is `"technical"`, domain-specific terms are acceptable without definitions.

6. Keep sentences short: **15-20 words average**. Break long sentences at natural clause boundaries.

7. Keep paragraphs short: **3-5 sentences maximum**. Use line breaks between paragraphs.

8. Use active voice. Passive voice is acceptable only when the actor is unknown or irrelevant.
   - GOOD: `"The system saves your changes automatically."`
   - BAD: `"Your changes are saved automatically by the system."`

---

## Link Text

1. Link text MUST be descriptive and self-explanatory. It must make sense **out of context** because screen readers present links in an isolated list.
   - GOOD: `"Download the 2024 Annual Report"`
   - BAD: `"Click here"`

2. NEVER use these as standalone link text: `"click here"`, `"read more"`, `"learn more"`, `"here"`, `"link"`, `"this"`.

3. For file downloads, include the file type and size in the link text:
   - `"Download the Q3 Budget (PDF, 2.4 MB)"`

4. Do not use the raw URL as link text unless the content is specifically listing URLs.

5. Keep link text concise — describe the destination or action in 2-8 words.

---

## Heading Semantics

1. Headings MUST describe the content of their section. Never use headings purely for visual styling (font size, bold).

2. Heading levels MUST reflect **document hierarchy**:
   - `h2` for top-level sections within the page
   - `h3` for subsections of an `h2`
   - `h4` for subsections of an `h3`
   - Never skip levels (e.g., `h2` directly to `h4`)

3. Every distinct content section SHOULD have a heading.

4. Headings MUST NOT be empty or contain only whitespace.

5. Do not duplicate heading text within the same page unless sections are genuinely distinct (e.g., "Overview" under two different parent headings is acceptable).

---

## Content Structure

1. Use **semantic markup** appropriate to the content type:
   - Unordered lists (`ul`) for items without sequence
   - Ordered lists (`ol`) for steps or ranked items
   - Headings for section titles
   - Paragraphs for body text
   - Blockquotes for quoted material

2. Tables MUST include a header row or header column. Keep table structure simple — avoid merged cells and nested tables.

3. Provide a text alternative for every piece of non-text content (images, charts, embedded media).

4. Sequential content (steps, instructions, timelines) MUST follow logical reading order. Do not rely on CSS or layout to reorder content.

5. Lists MUST have at least two items. A single-item list should be rewritten as a paragraph or inline text.

---

## Color & Visual References

1. NEVER use color alone to convey meaning.
   - BAD: `"Required fields are highlighted in red."`
   - GOOD: `"Required fields are marked with an asterisk (*)."`

2. Do not reference visual position in content text.
   - BAD: `"Click the button on the right."`
   - GOOD: `"Click the Submit button."`

3. Ensure all text content is meaningful without any visual context. Content must be understandable when read aloud or rendered in plain text.

---

## Error Messages & Forms

1. Error messages MUST identify **which field** has the error.

2. Error messages MUST describe **what the error is** and how to fix it.
   - GOOD: `"Enter a valid email address (e.g., name@example.com)."`
   - BAD: `"Invalid input."`

3. Use **positive framing** — tell the user what to do, not what they did wrong.
   - GOOD: `"Enter a date in YYYY-MM-DD format."`
   - BAD: `"Wrong date format."`

4. Group related form fields with descriptive labels. Every input field MUST have a label.

5. Do not use placeholder text as a substitute for labels.

---

## Multimedia

1. Video content MUST reference a transcript — either as inline content, a URL, or a relation to a document entry.

2. Audio content MUST have a text transcript available.

3. If content auto-plays, note this in metadata so the frontend can provide pause/stop controls. Auto-playing media with audio is strongly discouraged.

4. Time-based media (video, audio, animations) MUST include duration information when the model supports it.

5. Animated content (GIFs, auto-playing videos) should be flagged if longer than 5 seconds — provide a mechanism to pause.
