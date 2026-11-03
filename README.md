# Notes

<img src="docs/screenshot.png" width="380" alt="The Notes panel in Orca's right sidebar, showing a release checklist with headings, checked and open tasks, a quote, inline code and a code block.">

A notepad in Orca's right sidebar that styles Markdown as you type, like Notion or Jira, with
separate notes for each worktree.

- Markdown shortcuts turn into formatting as you type: `# ` to `### ` for headings, `- ` or `1. `
  for lists, `[] ` or `[x] ` for tasks, `> ` for quotes, ` ``` ` for code blocks, `---` for
  a rule, and `**bold**`, `*italic*`, `~~strike~~` and `` `code` `` inline.
- The usual shortcuts work too: Cmd+B, Cmd+I, Cmd+E for code, Cmd+Z to undo.
- The ⓘ beside the panel title lists these shortcuts on hover.
- Pasted URLs become links; Cmd+click (Ctrl+click elsewhere) opens one in the browser.
- Notes save as you type, with a small spinner in the header until they are written, and follow
  the focused worktree: each worktree keeps its own.

## Install

macOS:

```sh
open "orca://plugins/eliasjnior.worktree-notes?catalog=https://github.com/eliasjnior/orca-plugins.git"
```

Linux:

```sh
xdg-open "orca://plugins/eliasjnior.worktree-notes?catalog=https://github.com/eliasjnior/orca-plugins.git"
```

Orca opens the plugin's page: review the access it asks for and press **Install**. Other ways to
install are in the [repository README](../../README.md#install).

## Storage

Notes are stored as Markdown in the plugin's own storage (`storage.json` in Orca's plugin data),
keyed by the worktree's path. They are not written into the repository, so they never show up in
`git status`, and renaming a worktree keeps them. Moving or recreating a worktree at another path
starts it with empty notes.

## How it is built

- `panel/index.html` and `panel/main.ts`: an HTML panel running [Tiptap](https://tiptap.dev)
  (ProseMirror) with its Markdown extension. Its header, spacing and type match Orca's components
  panels (such as Scripts): colours come from Orca's `--orca-*` theme variables, and Orca's Geist
  font ships in `vendor/fonts` (SIL Open Font License) because frames load only the plugin's own
  files. The background uses `--orca-card`: Orca paints its app background behind HTML panels and
  does not pass them `--sidebar`, and `--card` is the sidebar colour in the default themes (within
  a shade or two in others, such as Ayu).
- `panel/notes.ts`: loading and debounced saving per worktree, with no DOM, so it is unit-tested.
- `src/worker.ts`: panels only learn the focused worktree's name and branch; the worker matches
  that against Orca's workspace list to get its path. The panel remembers each answer, so later
  opens load the notes straight from storage while the worker (which may have to start) confirms
  the path in the background.
- `vendor/tiptap.mjs`: Tiptap bundled into one file by `pnpm vendor` (frames load no npm packages).

## Access

- Runs a Node worker, only to look up the focused worktree's path.
- `workspace:read`: know which worktree is focused.
- `storage:own`: keep the notes.

## Limits

Orca's plugin storage limits apply: 256 KiB of Markdown per worktree and 5 MiB for all worktrees
together. A save over the limit shows an alert icon in the panel header (hover it for the reason) and
keeps the text in the editor.
