// The Notes panel: a Tiptap editor that styles Markdown as you type and stores Markdown, one
// document per worktree.
import type { FocusedAnswer } from '../src/protocol'
import { Editor, Markdown, Placeholder, StarterKit, TaskItem, TaskList } from '../vendor/tiptap.mjs'
import { NotesSession, type NotesTarget, type SaveState } from './notes'

// Spellcheck and hyphenation follow Orca's UI language.
document.documentElement.lang = orca.locale || 'en'

const byId = (id: string): HTMLElement => {
  const element = document.getElementById(id)
  if (!element) throw new Error(`#${id} is missing from index.html`)
  return element
}
const workspaceLabel = byId('workspace')
const statusLabel = byId('status')
const emptyState = byId('empty')
const editorHost = byId('editor')

const SAVE_ERROR = 'Could not save your notes. Your text is kept, and the next change tries again.'

/** Lucide's circle-alert, the icon Orca uses for warnings, drawn in the current text colour. */
function alertIcon(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  for (const [name, value] of Object.entries({
    width: '14',
    height: '14',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true'
  })) {
    svg.setAttribute(name, value)
  }
  for (const [tag, attributes] of [
    ['circle', { cx: '12', cy: '12', r: '10' }],
    ['line', { x1: '12', x2: '12', y1: '8', y2: '12' }],
    ['line', { x1: '12', x2: '12.01', y1: '16', y2: '16' }]
  ] as const) {
    const shape = document.createElementNS(ns, tag)
    for (const [name, value] of Object.entries(attributes)) shape.setAttribute(name, value)
    svg.append(shape)
  }
  return svg
}

/**
 * The header shows a small spinner while changes wait to be written, nothing once they are, and
 * an alert icon with a tooltip when a write failed (the text stays in the editor and the next
 * change retries).
 */
function showSaveState(state: SaveState | null): void {
  const unsaved = state === 'pending' || state === 'saving'
  const failed = state === 'error'
  statusLabel.classList.toggle('spinner', unsaved)
  statusLabel.classList.toggle('alert', failed)
  statusLabel.replaceChildren(...(failed ? [alertIcon()] : []))
  statusLabel.dataset.tooltip = failed ? SAVE_ERROR : ''
  statusLabel.tabIndex = failed ? 0 : -1
  if (unsaved || failed) {
    statusLabel.setAttribute('aria-label', failed ? SAVE_ERROR : 'Saving')
  } else {
    statusLabel.removeAttribute('aria-label')
  }
}

const session = new NotesSession(orca.storage, {
  onState: showSaveState
})

const editor = new Editor({
  element: editorHost,
  editable: false,
  extensions: [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      // A sandboxed frame cannot open windows; links open with Cmd/Ctrl+click below.
      link: { openOnClick: false, autolink: true, linkOnPaste: true }
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({
      // The Markdown shortcuts are listed in the ⓘ beside the panel title.
      placeholder: 'Write here'
    }),
    Markdown.configure({ markedOptions: { gfm: true } })
  ],
  editorProps: { attributes: { 'aria-label': 'Worktree notes', spellcheck: 'true' } },
  onUpdate: ({ editor }) => session.change(editor.getMarkdown())
})

function show(markdown: string): void {
  editor.commands.setContent(markdown, { contentType: 'markdown', emitUpdate: false })
}

function showEmpty(message: string): void {
  editor.setEditable(false, false)
  editorHost.hidden = true
  emptyState.hidden = false
  emptyState.textContent = message
  workspaceLabel.textContent = ''
  showSaveState(null)
}

async function openNotes(target: NotesTarget): Promise<void> {
  if (session.id === target.id) return
  editor.setEditable(false, false)
  const markdown = await session.open(target)
  if (markdown === null) return // A later focus change won.
  show(markdown)
  emptyState.hidden = true
  editorHost.hidden = false
  editor.setEditable(true, false)
  showSaveState(null)
}

/** What `workspace.changed` reports; `workspaceId` is absent for a paired Orca server's workspace. */
type FocusedContext = { workspaceId?: string; displayName: string; branch: string }

/** Bumped on every focus change, so a slower answer for an older one is dropped. */
let latest = 0
/** The workspace the open notes were confirmed for. */
let confirmed: string | null = null

/**
 * Shows why the focused workspace has no notes and forgets the workspace open before, so that
 * focusing it again loads its notes instead of keeping this message.
 */
async function showUnresolved(ticket: number, message: string): Promise<void> {
  confirmed = null
  await session.close()
  if (ticket === latest) showEmpty(message)
}

/**
 * Shows the focused workspace's notes, keyed by its id. Notes already stored under an id the panel
 * knows open straight from storage. Otherwise the worker, which may have to start first, names the
 * id (the panel does not get it for a workspace on a paired Orca server) and the path any older
 * notes were kept under, so they come along.
 */
async function sync(context: FocusedContext | null): Promise<void> {
  const ticket = ++latest
  if (!context) {
    await showUnresolved(ticket, 'Open a worktree to see its notes.')
    return
  }
  const contextId = `${context.workspaceId ?? ''}\n${context.displayName}\n${context.branch}`
  // Terminals opening or closing re-send the same workspace: nothing to do.
  if (contextId === confirmed && session.id) return
  workspaceLabel.textContent = context.branch
    ? `${context.displayName} · ${context.branch}`
    : context.displayName

  const known = context.workspaceId
  if (known && (await session.has(known))) {
    if (ticket !== latest) return
    confirmed = contextId
    await openNotes({ id: known })
    return
  }

  let answer: FocusedAnswer
  try {
    answer = await orca.plugin.request('workspace.focused')
  } catch (error) {
    if (ticket !== latest) return
    const reason = error instanceof Error ? error.message : String(error)
    await showUnresolved(ticket, `Could not load notes: ${reason}`)
    return
  }
  if (ticket !== latest) return
  const { workspace } = answer
  // The worker read the focus later than this event: drop an answer about another workspace.
  const same = known ? workspace?.id === known : workspace?.name === context.displayName
  if (!workspace || !same) {
    await showUnresolved(ticket, answer.error ?? 'Open a worktree to see its notes.')
    return
  }
  confirmed = contextId
  await openNotes({ id: workspace.id, legacyPath: workspace.legacyPath })
}

// Fires once with the current workspace as it subscribes, then on every focus change (and when
// terminals open or close, which `sync` skips for an unchanged workspace).
orca.on('workspace.changed', ({ context }) => void sync(context))

// Another Notes panel (a second window) saved this worktree's notes: take them unless editing.
orca.storage.onDidChange(async ({ key }) => {
  if (!session.owns(key) || session.dirty || editor.isFocused) return
  const markdown = await session.reload()
  if (markdown !== null && markdown !== editor.getMarkdown()) show(markdown)
})

// Links: Cmd/Ctrl+click opens them in the browser, which Orca confirms for new hosts.
editorHost.addEventListener('click', (event) => {
  const link = (event.target as Element | null)?.closest('a[href]')
  if (!link || !(event.metaKey || event.ctrlKey)) return
  event.preventDefault()
  void orca.shell?.openExternal(link.getAttribute('href') ?? '')
})

// Write what is pending before the panel goes away.
addEventListener('pagehide', () => void session.flush())
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void session.flush()
})
