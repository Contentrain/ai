# Changesets

This repository uses [Changesets](https://github.com/changesets/changesets) for package versioning, changelogs, tags, and npm publishing.

## Create a release note

When a change affects a publishable package, run:

```bash
pnpm changeset
```

Choose the affected package(s), select the bump type, and describe the change in one short paragraph.

## Release flow

- Contributors add changesets in pull requests.
- The `Release` GitHub Action opens or updates a release PR on `main`.
- Merging that release PR versions packages, updates package `CHANGELOG.md` files, publishes to npm, and creates package tags/releases.
