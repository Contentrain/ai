# @contentrain/wp-import

## 0.9.2

### Patch Changes

- Updated dependencies [e62e002]
  - @contentrain/types@1.28.0

## 0.9.1

### Patch Changes

- 472398e: A login redirect rule's `condition` holds only its two addresses (`logged_in`, `logged_out`), never anything else Redirection stores in the rule's data.
- Updated dependencies [3e6512c]
- Updated dependencies [64966a9]
- Updated dependencies [383d7ae]
  - @contentrain/types@1.27.0

## 0.9.0

### Minor Changes

- 2578366: Redirect rules carry what their source says about matching: `RawRedirect.query` (`exact` / `ignore` / `pass`, the Redirection plugin's modes), `case_insensitive` and `trailing_slash`. A rule that answers "gone" (410, 451) is a served rule with an empty `to`. `RawAttachment.link` is the attachment's own page, for its redirect. wp-import over REST reads the Redirection plugin's rules (`redirection/v1`, with a credential that may manage it) into `redirects` and `redirects_excluded`, shaped as the Bridge shapes them. It reads each attachment's page from REST and WXR. New gaps: `redirects_partial` (always over REST: Yoast Premium, Rank Math, Safe Redirect Manager and `.htaccess` are Bridge-only) and `redirects_require_auth`.
- 09be01c: Menu items that name a public post or term point at its public address (the post's or term's `link`), not the address the block or menu item kept: a block stores the url it had when it was saved, and a typed `?page_id=` is a form the migrated site cannot serve. `MenuContext` gains optional `postLink` / `termLink`. A typed `?page_id=` / `?p=` link counts as this site's with or without a leading `www.`, over either scheme, as the Bridge reads it. `fixtures/menu-parity.json` (`contentrain-menu-parity@1`) is the menu parity fixture the Bridge copies; `rest-menus.parity.test.ts` runs wp-import's side.

### Patch Changes

- 6ea3d21: A conditional Redirection rule keeps its `condition` only when it is a login rule (two addresses). A cookie, header, IP, role or other condition holds the value a visitor must present, so it is no longer exported; the reason still names its type. `RawAttachment.link` is kept only when the attachment has no parent or its parent is proven public, because an attachment page under a draft, private or scheduled post carries that post's slug. Both match the Bridge (#38). The redirect parity fixture gains a cookie rule and a header rule, each without a condition.
- Updated dependencies [334852f]
- Updated dependencies [951af8c]
- Updated dependencies [2578366]
  - @contentrain/types@1.26.0

## 0.8.0

### Minor Changes

- 01c0065: ACF sub-fields of repeaters, groups and flexible layouts are typed from their stated ACF type (SCF's `_source` inside each row) by the same table as top-level fields, instead of from their values. A select or checkbox value outside the field's stated choices is left out and counted in the new `ImportReport.acf_outside_choices`.

  ACF date time picker values carry the site's UTC offset for that moment, DST included (`2025-03-10T09:30:00+03:00`): `fetchRestRawIR` reads `timezone_string` and `gmt_offset` from the `/wp-json/` index into `RawIR.site.timezone` / `gmt_offset`. Without either, the value stays local and `ImportReport.acf_datetime_unzoned` counts it. `acfValue`'s third argument is now a context (`{ timeZone, gmtOffset, dropped, unzoned }`).

  `src/fixtures/acf-parity.json` holds the ACF → Contentrain cases the Contentrain Bridge must map the same way.

  `@contentrain/types`: `RawSite.timezone?` and `RawSite.gmt_offset?`.

- 9121e22: `fetchRestRawIR` and `rawToContentrain` carry ACF / Secure Custom Fields. Values on a post's REST `acf` key are typed by one deterministic, versioned table (`ACF_MAPPING_VERSION`): the ACF type comes from SCF's `<name>_source` where the site states it, else from the value's shape. Repeaters and groups become nested `array`/`object` fields, flexible content an `array` of rows with a required `layout`, link and Google Map fixed-shape objects, post object / relationship / taxonomy / user / gallery fields relations to the store's entries, page link the target's address when that target is public.

  A `password` field is never read, at any depth (repeater rows, groups, flexible layouts): not into `RawIR`, not into the store. Without stated types (plain ACF), secret fields are recognised by whole-word names. ACF values follow their post's status, so a draft's fields land with the draft. When posts carry ACF, `gaps` contains `acf_partial` (groups outside REST, options pages and non-REST post types need the Bridge).

  With an Application Password, post types are read with `context=edit`: a type that is not publicly viewable gets no address. Custom taxonomies in REST are read with their terms and linked from posts.

  `@contentrain/types`: `RawAcfValue.field_key` is optional, and `type?` / `label?` carry the stated ACF type and label.

- aa68347: `fetchRestRawIR` reads inline navigation: a navigation block in a template part that carries its own links (Twenty Twenty-Five's footer columns) becomes a menu of that part's area (`Footer navigation 1`, `2`, …; a navigation's `ariaLabel` names it), with its links in order and nested, and the same fail-closed rule for links to content not proven public. Only template parts a template uses count (`/wp/v2/templates`; without them, the part named after its area): a theme's unused alternatives (`footer-columns`, `header-large-title`) no longer lend locations or menus. A `#` link stays `#`. Inline menus have no WordPress record: they get negative ids and the store claims no `wp_id` for them.

### Patch Changes

- 1436fa6: `rawToContentrain` no longer names a site "Site" when the source gives no title. With neither a REST index name nor a WXR channel title, the `site` entry has no `title` (the field stays required, so the store shows what is missing) and the report's new `site_title_missing` is `true`.
- Updated dependencies [3eb5832]
- Updated dependencies [36e5773]
- Updated dependencies [01c0065]
- Updated dependencies [9121e22]
  - @contentrain/types@1.25.0

## 0.7.0

### Minor Changes

- 53505cd: `fetchRestRawIR` reads menus. With an Application Password it fills `RawIR.menus` from classic menus (`/wp/v2/menus`, `/wp/v2/menu-items`) and from a block theme's published `wp_navigation` posts, so a REST import of a block-theme site no longer arrives with an empty header navigation. Each menu carries `locations`: the theme locations a classic menu is assigned to, or the template-part areas (`header`, `footer`) that show a block navigation.

  Only what visitors are proven to see is kept: an item that is a draft, or points at a post this import did not read as published and unprotected, is left out (fail-closed) (its label is often that post's title); its children move up, and `warnings` gives only a count.

  `fetchRestRawIR` also reads the `/wp-json/` index: the site's name and tagline fill `RawIR.site.title` / `description`, so the store's `site` singleton no longer says "Site"; `url` / `home` fill `base_site_url` / `base_blog_url`.

  Menus need `edit_theme_options`. When they cannot be read — no credential, a rejected one, or a user without that right — the new `gaps` field of the result contains `menus_require_auth` instead of the import silently returning no menus.

  `@contentrain/types`: `RawMenu.locations?: string[]` (optional; producers that do not know leave it out). A block navigation's items, which have no WordPress id, carry negative ids.

### Patch Changes

- Updated dependencies [53505cd]
  - @contentrain/types@1.24.0

## 0.6.0

### Minor Changes

- d87121b: The comments export carries only public discussion. `buildCommentsExport` keeps comments on published, unprotected entries that are approved (`'1'`) or pending (`'0'`, which lands in the receiving service's moderation queue). It leaves out comments on drafts, private, scheduled and password-protected entries, any other status (spam, trash, `post-trashed`, a plugin's own), and comments on entries the import does not hold. An allowlist, so it fails closed. It counts what it leaves out in the new optional `CommentsExport.excluded` (`non_public_entry`, `unknown_entry`, `spam`, `trash`, `other_status`), which `summarizeComments` passes to `HandoffComments.excluded`. `selectComments(raw)` exposes the selection.

### Patch Changes

- a726843: `fetchRestRawIR` returns `credential: { status, fell_back }`, so a caller can tell whether the Application Password was honoured without reading `warnings`. `status` is `none` without `auth`, `accepted` when every listing it unlocks was read with it, and `rejected` when at least one was not; `fell_back` names those listings (`posts`, `pages`, a custom type's REST base, `comments`, `comments:hold`).

  A credential the site rejects outright is now found by one `users/me` request and dropped. WordPress answers a wrong Application Password with 401 on every route, public ones included, and the fallback to the public listing used to resend it, so such an import came back with no posts, no terms and no comments while its provenance said `rest_auth`. It now imports the public site, as `rest_public`. The fallback for a single refused listing is anonymous too.

- Updated dependencies [d87121b]
- Updated dependencies [90b5049]
  - @contentrain/types@1.23.0

## 0.5.7

### Patch Changes

- 0075321: `fetchRestRawIR` with a credential now imports unpublished content. Post types are listed with `status=publish,future,draft,pending,private&context=edit`, and comments with two listings, approved and held. Before, the credential was sent but the listing kept WordPress's defaults, so drafts, scheduled, pending and private posts and held comments were missing. If the site refuses the credential those listings, the import falls back to the public listing with a warning. Without a credential nothing changes.

  Password-protected posts now always come in as `draft` (with `visibility: password`), on every path — WXR, REST and Bridge. Before, a protected post that WordPress had published became a `published` entry, and its body is the protected text, which nothing downstream hides: it would ship on a static site. `import-report.json` counts them in `password_protected_drafts`. The importers also stop reading the password itself: `RawPost.password` is the marker `[protected]`.

## 0.5.6

### Patch Changes

- Updated dependencies [9909194]
- Updated dependencies [250fe5e]
  - @contentrain/types@1.22.0

## 0.5.5

### Patch Changes

- Updated dependencies [10c9b85]
  - @contentrain/types@1.21.0

## 0.5.4

### Patch Changes

- Updated dependencies [fbb651c]
  - @contentrain/types@1.20.0

## 0.5.3

### Patch Changes

- Updated dependencies [93ab71d]
  - @contentrain/types@1.19.1

## 0.5.2

### Patch Changes

- Updated dependencies [c069c67]
  - @contentrain/types@1.19.0

## 0.5.1

### Patch Changes

- Updated dependencies [ae0b3ec]
  - @contentrain/types@1.18.1

## 0.5.0

### Minor Changes

- 8e0331f: `rawToContentrain` writes `model.locales` for a partially-translated site: each post type declares the locales it actually has content in, so `contentrain validate` checks parity against that subset instead of the whole project list. Pages that only ever existed in one language stop being hard errors.

  The project's default locale is always included — a post carrying no language tag belongs to it, so its absence would be the importer's uncertainty rather than a fact about the site. A post type translated into every locale gets no `locales` key at all: absent already means "all", and a redundant list would have to be maintained as locales are added. A monolingual site is unchanged.

  No new report is produced here; this only sets `model.locales` correctly.

- d09cb72: `planSourceDelta` places a bridge's `SourceDeltaPlan` in the repository's store.

  - Every record gets its model, entry id and locale. Post-type records are placed through the `EntrySourceMap`; terms and media by `wp_id` in their own model, never through the post map. A record that cannot be placed gets `unmapped` with a reason.
  - `updated` and `moved` records get `fields_changed` against the incoming export.
  - Every changed address adds a 301 to `redirects`.
  - `deleted` stays a tombstone, with trashed and purged kept apart.
  - A record the repository also edited since the import gets `conflict: true` and the edit's `repo_edit`; it is never overwritten.

  The planner is pure and plan-only. `formatSourceDeltaReport` prints the plan for a dry run.

### Patch Changes

- Updated dependencies [568a319]
- Updated dependencies [39a1de7]
- Updated dependencies [8e0331f]
- Updated dependencies [d44e030]
- Updated dependencies [d09cb72]
- Updated dependencies [ff9095e]
  - @contentrain/types@1.18.0

## 0.4.6

### Patch Changes

- 197a568: `validateFieldValue` accepts a polymorphic relation. A `relation` whose `model` lists several targets stores `{ model, ref }` — the schema documents it and the MCP validator enforces it — but the type check knew only the string form and rejected every such value, so an imported media library failed validation on every attachment with a `parent`. The pair is now required exactly when there are several targets (a one-element `model` array is a single target and stores the id), and a `model` outside the declared targets is an error.

  `rawToContentrain` writes a relation over one target as the entry id. Media `parent`, comment `post` and menu-item `target` always wrote `{ model, ref }`, which is invalid when a site has a single content type (and, for menu targets, no taxonomies). The choice is now made in one place from the same list the model declares, and a test checks every field the importer writes against its own model.

  The skills' schema reference and the field-types reference now show the polymorphic storage form.

- Updated dependencies [197a568]
- Updated dependencies [bb8dbe1]
  - @contentrain/types@1.17.0

## 0.4.5

### Patch Changes

- Updated dependencies [346acbb]
  - @contentrain/types@1.16.0

## 0.4.4

### Patch Changes

- Updated dependencies [897834b]
  - @contentrain/types@1.15.0

## 0.4.3

### Patch Changes

- Updated dependencies [520f60f]
- Updated dependencies [2fae9fb]
  - @contentrain/types@1.14.0

## 0.4.2

### Patch Changes

- Updated dependencies [463297e]
  - @contentrain/types@1.13.1

## 0.4.1

### Patch Changes

- 4ddf24c: Preserve distinct translation groups when their canonical posts share a slug. Existing non-colliding entry identities remain unchanged; colliding groups receive deterministic WP-id identities. Reject translation groups that collapse to one normalized locale instead of silently overwriting a translation.

  Render parameterless collection routes directly from exactly one content entry, with an explicit build error for missing or ambiguous data. Exclude public assets and dependencies from generated Astro typechecking to prevent legacy WordPress JavaScript from exhausting the build heap.

  WordPress `future` posts preserve publication intent as published metadata gated by `publish_at`. Undated scheduled posts fail import. Public consumers must honor the publication window rather than checking status alone.

  The migrate skill's mapping reference carried the old `future` → `draft` answer; a parity test now runs the importer and holds the status table to what it actually writes.

## 0.4.0

### Minor Changes

- c1f1984: Multilingual sites import as an i18n store

  `RawPost.lang` carries a post's language as the plugin reports it (Polylang
  `lang` / `language` term, WPML `wpml_current_locale`), and the REST and WXR
  importers fill `RawIR.language_pairs` from Polylang `translations` /
  `post_translations` and WPML `wpml_translations` — one pair per group.

  `rawToContentrain` sees more than one locale and switches post-type models to
  `i18n: true`: content and meta per locale, one shared entry id per translation
  group (canonical = default-locale post, else lowest id), `entry_source_map`
  locale per post, `config.locales.supported` listing every locale. Language
  bookkeeping taxonomies never become models. Monolingual sites are unchanged.
  Until now the REST path dropped `lang` and Migrate had to patch locales into
  the source map by hand.

### Patch Changes

- Updated dependencies [c1f1984]
  - @contentrain/types@1.13.0

## 0.3.0

### Minor Changes

- be46e34: Migration readiness: what the first real WordPress run through the pipeline asked for

  **Emitter — `EmittedPost.terms` accepts `{ name, link }` (customer-visible fix).**
  A theme whose term list links each term feeds a repeat block objects, and the
  emitted `fill.ts` typed `terms` as `string[]` — `astro build` passed but the
  generated project's own `npm run build` (`astro check && astro build`) failed
  on the page that reads the data. `terms` is now `Array<string | { name, link? }>`;
  `term{n}` and `terms` marks print the name either way, repeat blocks read
  `item_name` / `item_link`, and `postMarks` normalizes strings so a template
  written for names keeps working when the producer starts sending objects.

  **Emitter — component markers inside content bodies mount too.** A contact
  form usually lives in a page's `post_content`, not in the chrome. A
  `<!--@@component:ID@@-->` marker found in a post body now enters the mount
  table of the family that renders that collection, so the layout imports the
  component and mounts it at the marker exactly as it does for chrome markers.
  A body marker with no definition is warned once per family. Route literals may
  carry Unicode; `.` / `..` segments are rejected.

  **Emitter docs — `src/data/runtime.json` can be rewritten alone.** Components
  read the binding from that file only, so binding a project id later needs no
  re-emit.

  **Types — `ModelDefinition.form` / `.comments`, `MODEL_EXTENSION_KEYS`.** The
  runtime provider's public form and comments settings live in the model file;
  the content engine carries them verbatim. `MODEL_FIELD_ORDER` places them last.

  **MCP — `contentrain_model_save` preserves `form` and `comments`.** The tool
  rebuilt the definition from its own input, so an agent adding one field
  silently switched a live contact form off. Existing blocks are carried forward
  on update and named in `preserved_blocks`. `contentrain_validate` accepts a
  model file that carries them (it already did; now tested).

  **wp-import — `concurrency` and `maxPages` on `fetchRestRawIR`.** All pages of
  every collection were requested in one `Promise.all` (~150 simultaneous
  requests on a mid-size site). One pool now bounds requests across collections
  (default 4, slot held until the body is consumed), `maxPages` caps each
  collection and names what was skipped, failed pages are warned rather than
  dropped silently. `SKIP_TYPES` gains GeneratePress / GenerateBlocks / Elementor
  template types and Contact Form 7 / WPForms form definitions — design, not
  content. ACF field records stay: their cross-model parents are part of the
  lossless import.

  **Rules & skills — schema, MCP-usage and mapping references name the preserved blocks and the newly skipped post types** (the parity tests hold the docs to the code).

### Patch Changes

- Updated dependencies [be46e34]
  - @contentrain/types@1.12.0

## 0.2.2

### Patch Changes

- Updated dependencies [adf26c1]
  - @contentrain/types@1.11.0

## 0.2.1

### Patch Changes

- 94a9e11: Preserve WordPress parent links across exported post types, including ACF field
  groups and nested fields. Single-target parents remain entry ID strings; mixed
  targets use the existing polymorphic relation contract. Excluded WordPress types
  no longer produce dangling entry-source addresses or relation targets. Missing
  parents remain reported as dropped relations.

## 0.2.0

### Minor Changes

- bc10dc0: `contentrain-migrate-wordpress` skill

  The WordPress path existed as packages (`@contentrain/wp-import`, `contentrain import`) but no skill taught an agent to walk it: pick the source, import, **read the report**, validate, then wire the content to Astro's content layer or the generated client — and hand back what the import cannot decide (comments, redirects, media files).

  `references/wordpress-mapping.md` documents where each WordPress concept lands, which fields appear only when the source has the data, how status maps, and what is dropped.

  `@contentrain/wp-import` now exports `SKIP_TYPES` and `PLUGIN_META`. They are documented behaviour — an agent has to answer "why is my custom post type missing?" — and a parity test holds the reference to them, so an exclusion added to the importer cannot silently outlive its documentation.

## 0.1.7

### Patch Changes

- Updated dependencies [b4724a1]
  - @contentrain/types@1.10.0

## 0.1.6

### Patch Changes

- Updated dependencies [487a061]
  - @contentrain/types@1.9.1

## 0.1.5

### Patch Changes

- Updated dependencies [68f4582]
  - @contentrain/types@1.9.0

## 0.1.4

### Patch Changes

- Updated dependencies [4079160]
  - @contentrain/types@1.8.0

## 0.1.3

### Patch Changes

- Updated dependencies [b92140a]
  - @contentrain/types@1.7.0

## 0.1.2

### Patch Changes

- Updated dependencies [ca62ade]
  - @contentrain/types@1.6.0

## 0.1.1

### Patch Changes

- Updated dependencies [364af0f]
  - @contentrain/types@1.5.0

## 0.1.0

### Minor Changes

- 87a11a8: New package: WordPress importers. `parseWxr` (streaming WXR → RawIR with PHP-serialized meta decoding, ACF pairing, menu/comment threading, resolution flags), `fetchRestRawIR` (public/Application-Password REST → RawIR with paginated fetch and injectable fetch), `rawToContentrain` (RawIR → canonical `.contentrain` file map + `EntrySourceMap` + import report), and `buildCommentsExport`/`summarizeComments` (`contentrain-comments@1` intake payload).

### Patch Changes

- Updated dependencies [c0960f8]
  - @contentrain/types@1.4.0
