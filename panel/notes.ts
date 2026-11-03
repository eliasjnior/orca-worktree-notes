// Loads and saves one workspace's notes in the plugin's storage, with debounced writes.
// No DOM here, so it runs in `orca plugin test`.

type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

/** The part of the frame's `orca.storage` the notes use. */
export type NotesStorage = {
  get(key: string): Promise<Json | null>
  set(key: string, value: Json): Promise<void>
}

/** What one storage entry holds. */
export type StoredNotes = { path: string; markdown: string; updatedAt: number }

/** Storage key for a workspace path: a digest keeps keys short and free of path characters. */
export async function notesKey(path: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(path))
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0'))
  return `notes/${hex.join('').slice(0, 32)}`
}

function markdownOf(value: Json | null): string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return ''
  return typeof value.markdown === 'string' ? value.markdown : ''
}

export type SaveState = 'saved' | 'pending' | 'saving' | 'error'

export class NotesSession {
  #path: string | null = null
  #key: string | null = null
  #draft: string | null = null
  /** What storage holds for the open workspace, as far as this session knows. */
  #saved = ''
  #timer: ReturnType<typeof setTimeout> | null = null
  #writing: Promise<void> = Promise.resolve()
  #opening = 0

  constructor(
    private readonly storage: NotesStorage,
    private readonly options: { debounceMs?: number; onState?: (state: SaveState) => void } = {}
  ) {}

  /** The workspace path the notes belong to, or null before the first `open`. */
  get path(): string | null {
    return this.#path
  }

  /** True while a change waits to be written. */
  get dirty(): boolean {
    return this.#draft !== null
  }

  /**
   * Saves the current workspace's pending change, then loads `path`'s notes. Resolves null when a
   * later `open` overtook this one, so the caller drops a stale answer.
   */
  async open(path: string): Promise<string | null> {
    const ticket = ++this.#opening
    await this.flush()
    const key = await notesKey(path)
    const markdown = markdownOf(await this.storage.get(key))
    if (ticket !== this.#opening) return null
    this.#path = path
    this.#key = key
    this.#saved = markdown
    return markdown
  }

  /** Stops saving to any workspace, after writing what is pending. */
  async close(): Promise<void> {
    this.#opening++
    await this.flush()
    this.#path = null
    this.#key = null
  }

  /** The stored notes of the open workspace, for reloading after another panel wrote them. */
  async reload(): Promise<string | null> {
    if (!this.#key) return null
    const key = this.#key
    const markdown = markdownOf(await this.storage.get(key))
    if (key === this.#key) this.#saved = markdown
    return markdown
  }

  /** Whether a storage change under `key` concerns the open workspace. */
  owns(key: string): boolean {
    return key === this.#key
  }

  /** Schedules a write of `markdown` for the open workspace. */
  change(markdown: string): void {
    if (!this.#key) return
    if (this.#draft === null && markdown === this.#saved) return
    this.#draft = markdown
    this.options.onState?.('pending')
    if (this.#timer) clearTimeout(this.#timer)
    this.#timer = setTimeout(() => void this.flush(), this.options.debounceMs ?? 400)
  }

  /** Writes the pending change now. */
  async flush(): Promise<void> {
    if (this.#timer) clearTimeout(this.#timer)
    this.#timer = null
    const draft = this.#draft
    const key = this.#key
    const path = this.#path
    if (draft === null || key === null || path === null) return this.#writing
    this.#draft = null
    const value: StoredNotes = { path, markdown: draft, updatedAt: Date.now() }
    this.#writing = this.#writing.then(async () => {
      this.options.onState?.('saving')
      try {
        await this.storage.set(key, value)
        if (this.#key === key) this.#saved = draft
        this.options.onState?.(this.#draft === null ? 'saved' : 'pending')
      } catch {
        // Keep the text so the next change or flush retries it, unless a newer one replaced it
        // or another workspace is open now.
        if (this.#key === key) this.#draft ??= draft
        this.options.onState?.('error')
      }
    })
    return this.#writing
  }
}

/** What `workspace.changed` reports for the focused workspace. */
export type FocusedContext = { displayName: string; branch: string }

const PATHS_KEY = 'paths'
const MAX_REMEMBERED_PATHS = 200

const contextKey = ({ displayName, branch }: FocusedContext): string => `${displayName}\n${branch}`

/**
 * Remembers which path each workspace name and branch resolved to, so the panel opens the notes
 * straight from storage while the worker (which may need to start) confirms in the background.
 */
export class PathCache {
  constructor(private readonly storage: NotesStorage) {}

  async #all(): Promise<Record<string, string>> {
    const value = await this.storage.get(PATHS_KEY)
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string'
      )
    )
  }

  async get(context: FocusedContext): Promise<string | null> {
    return (await this.#all())[contextKey(context)] ?? null
  }

  /** Stores the path, most recent last, keeping the newest entries only. */
  async remember(context: FocusedContext, path: string): Promise<void> {
    const all = await this.#all()
    const key = contextKey(context)
    if (all[key] === path) return
    delete all[key]
    all[key] = path
    const entries = Object.entries(all).slice(-MAX_REMEMBERED_PATHS)
    await this.storage.set(PATHS_KEY, Object.fromEntries(entries))
  }
}
