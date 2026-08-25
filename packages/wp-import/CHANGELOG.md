# @contentrain/wp-import

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
