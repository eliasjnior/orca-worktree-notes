# Changelog

Notable changes to Notes, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2026-11-16

### Fixed

- Worktrees on a paired Orca server get notes. Focusing one used to show "Could not match the
  focused workspace … to exactly one workspace in Orca", and its notes could not be created or
  edited.
- A worktree on a paired Orca server no longer opens the notes of a local worktree with the same
  name and branch.
- Focusing a worktree again after one that could not be identified loads its notes instead of
  keeping the error.

### Changed

- Notes are keyed by the id Orca gives each worktree instead of its path. Notes from earlier
  versions move to the new key the first time their worktree opens; the old entry is removed only
  once the copy is stored.
- Notes of a worktree already opened since 1.3.0 load straight from storage, without waiting for
  the plugin's worker to start.
- Needs Orca 1.4.259 or newer.

## [1.2.0] - 2026-11-04

### Changed

- Notes moved from `eliasjnior/orca-plugins` into its own repository and installs from Orca's
  plugin directory.

## 1.1.2 - 2026-11-04

### Fixed

- The panel uses the system UI font instead of bundling Geist, which kept Orca's plugin directory
  from listing the plugin.

## 1.1.1 - 2026-11-03

### Fixed

- The cover keeps the plugin's name and tagline visible on Orca's plugin page.

## 1.1.0 - 2026-11-03

### Added

- Icon, cover and screenshot for Orca's plugin directory.

### Changed

- A shorter description, so the directory's cards no longer cut it.

## 1.0.0 - 2026-11-03

### Added

- A Notes panel in the right sidebar that styles Markdown as you type and keeps one document per
  worktree, in the plugin's own storage.
- A spinner while changes wait to be saved, an alert icon that explains a failed save, and a list
  of the Markdown shortcuts beside the panel title.

Versions up to 1.1.2 were released from `eliasjnior/orca-plugins`, which has since been deleted.

[1.3.0]: https://github.com/eliasjnior/orca-worktree-notes/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/eliasjnior/orca-worktree-notes/releases/tag/v1.2.0
