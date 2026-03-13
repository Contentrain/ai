# Media Rules

These rules are MANDATORY for all AI agents creating or editing content in Contentrain projects.
Follow these guidelines when populating image, video, or file fields in any content model.

---

## Image Dimensions (Recommended)

1. Use these standard dimensions unless the project's `context.json` specifies overrides:

   | Purpose | Width | Height | Aspect Ratio |
   |---|---|---|---|
   | Hero / Banner | 1200px | 630px | ~1.91:1 |
   | Thumbnail / Card | 400px | 300px | 4:3 |
   | Avatar / Profile | 200px | 200px | 1:1 (square) |
   | Icon | 64px or 128px | 64px or 128px | 1:1 (square) |
   | Full-width content | 1200px | proportional | varies |
   | Social share (og:image) | 1200px | 630px | 1.91:1 |

2. Hero/banner dimensions (1200x630) double as optimal `og:image` dimensions for social sharing.

3. All images MUST be usable at mobile widths. Minimum renderable width: **320px**. Do not provide images narrower than this.

4. When a model defines `width` and `height` fields alongside an image field, populate them with the actual image dimensions to prevent layout shift.

---

## File Formats

1. **WebP** is the preferred format for all web images. Use it as the default unless a specific reason requires another format.

2. **PNG**: use only when transparency is required and SVG is not suitable.

3. **JPEG/JPG**: acceptable for photographs when WebP is not available. Use quality 75-85 for a good compression/quality balance.

4. **SVG**: REQUIRED for logos, icons, and any vector graphics. Do not rasterize vector content.

5. **AVIF**: acceptable as a progressive enhancement for browsers that support it. Always provide a WebP or JPEG fallback.

6. **GIF**: do NOT use for animations. Use MP4 video instead for better compression and performance. Static GIFs are acceptable but WebP is preferred.

7. **Never use** these formats for web content: BMP, TIFF, RAW, PSD, AI, EPS. Convert to a web-safe format before storing.

---

## File Size Limits

1. Enforce these maximum file sizes:

   | Asset Type | Max Size |
   |---|---|
   | Hero / Banner image | 200 KB |
   | Thumbnail | 50 KB |
   | Avatar / Icon | 30 KB |
   | Content image | 150 KB |
   | SVG file | 50 KB |
   | Video poster image | 100 KB |

2. **Total images per page**: aim for under **1 MB combined**. Flag content entries that reference more than 1 MB of images.

3. If an image exceeds the size limit, instruct the user to compress or resize it before storing. Do not silently accept oversized files.

4. SVG files SHOULD be optimized (e.g., with SVGO) to remove editor metadata, comments, and unnecessary attributes.

---

## File Naming Convention

1. Use **kebab-case** for all media file names: lowercase, words separated by hyphens.

2. File names MUST be **descriptive** — include context and subject:
   - GOOD: `homepage-hero-banner.webp`, `blog-author-jane-doe.jpg`, `product-dashboard-preview.webp`
   - BAD: `IMG_4523.jpg`, `photo1.png`, `untitled.webp`, `Screenshot 2024-01-15.png`, `image.jpg`

3. When providing multiple sizes of the same image, include dimensions in the filename:
   - `hero-1200x630.webp`, `hero-600x315.webp`
   - Or use size suffixes: `hero-lg.webp`, `hero-md.webp`, `hero-sm.webp`

4. Allowed characters in file names: lowercase letters (`a-z`), digits (`0-9`), hyphens (`-`), and a single dot before the extension. No spaces, underscores, or special characters.

5. File extensions MUST be lowercase: `.webp` not `.WebP`, `.jpg` not `.JPG`.

---

## Alt Text Pairing

1. Every content model with an `image` field SHOULD define a companion `image_alt` field (type: `string`). If the model does not have one, request that it be added.

2. When both `image` and `image_alt` fields exist, ALWAYS populate both. Never leave `image_alt` empty unless the image is decorative (set to `""`).

3. If no dedicated alt text field exists, include alt text guidance in the image field's `description` metadata so future content editors know to provide it.

4. In document/markdown models, always use the full image syntax with alt text: `![descriptive alt text](path/to/image.webp)`. Never use `![](path)`.

5. See `accessibility-rules.md` for detailed alt text writing guidelines.

---

## Video Guidelines

1. **Format**: MP4 with H.264 codec for maximum browser compatibility. WebM (VP9) is acceptable as a secondary format.

2. Every video MUST have a **poster/thumbnail image**. If the model has a `poster` or `thumbnail` field, populate it. The poster image follows the same format and size rules as other images.

3. If the model defines a `duration` field, populate it in seconds (integer). This helps the frontend display duration badges and improves accessibility.

4. Every video MUST reference a transcript or caption:
   - A `transcript_url` field pointing to a text/VTT file
   - A relation to a document entry containing the transcript
   - Or inline transcript in an adjacent richtext/markdown field

5. **Max file size** for self-hosted embedded video: **50 MB**. For larger videos, use external hosting.

6. Prefer **external hosting** (YouTube, Vimeo, or CDN) for videos over 50 MB. Store the external URL in a `url` type field, not the video binary.

7. Do not auto-play videos with audio. If the model has an `autoplay` field, set it to `false` by default.

---

## Asset Organization

1. All media MUST be stored under the path defined in `config.json > assets_path`. The default is `.contentrain/assets/`.

2. Organize assets using ONE of these conventions per project (check existing structure first):

   **By domain:**
   ```
   assets/blog/
   assets/team/
   assets/products/
   assets/marketing/
   ```

   **By type:**
   ```
   assets/images/
   assets/videos/
   assets/documents/
   ```

3. Check the existing asset directory structure before adding new files. Follow the established convention. Do not mix conventions within a project.

4. Reference all media with **relative paths from the project root**:
   - GOOD: `.contentrain/assets/blog/post-hero.webp`
   - BAD: `/Users/jane/project/.contentrain/assets/blog/post-hero.webp`

5. Do not create deeply nested directories (max 3 levels under `assets/`). Deep nesting makes paths fragile and hard to manage.

---

## Responsive Images

1. When the content model supports multiple image sizes, provide variants for:
   - **Small** (mobile): 320-768px wide
   - **Medium** (tablet): 768-1024px wide
   - **Large** (desktop): 1024px+ wide

2. Use descriptive size suffixes in filenames: `-sm`, `-md`, `-lg` or explicit dimensions (`-400w`, `-800w`, `-1200w`).

3. Always provide at least the **largest size**. Smaller sizes are recommended but optional — CDN or image optimization services can generate them from the original.

4. If the model has a single `image` field (no responsive variants), provide the largest recommended size. The frontend is responsible for responsive rendering.

5. Store the original/largest image. Never store only a downscaled version — you lose the ability to generate other sizes later.
