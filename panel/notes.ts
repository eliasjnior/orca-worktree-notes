// Loads and saves one workspace's notes in the plugin's storage, with debounced writes.
// No DOM here, so it runs in `orca plugin test`.

type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

/** The part of the frame's `orca.storage` the notes use. */
export type NotesStorage = {
  get(key: string): Promise<Json | null>
  set(key: string, value: Json): Promise<void>
  delete(key: string): Promise<void>
}

/** What one storage entry holds. */
export type StoredNotes = { workspaceId: string; markdown: string; updatedAt: number }

/** The workspace to open: its id, and the path its notes were kept under up to 1.2, if known. */
export type NotesTarget = { id: string; legacyPath?: string | null }

async function digest(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  const hex = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0'))
  return hex.join('').slice(0, 32)
}

/** Storage key for a workspace id: a digest keeps keys short and free of path characters. */
export async function notesKey(workspaceId: string): Promise<string> {
  return `workspace-notes/${await digest(workspaceId)}`
}

/** Where versions up to 1.2 kept a workspace's notes: keyed by its path. */
export async function legacyNotesKey(path: string): Promise<string> {
  return `notes/${await digest(path)}`
}

function storedMarkdown(value: Json | null): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return typeof value.markdown === 'string' ? value.markdown : null
}

function storedUpdatedAt(value: Json | null): number {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return Date.now()
  return typeof value.updatedAt === 'number' ? value.updatedAt : Date.now()
}

export type SaveState = 'saved' | 'pending' | 'saving' | 'error'

export class NotesSession {
  #id: string | null = null
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

  /** The workspace id the notes belong to, or null before the first `open`. */
  get id(): string | null {
    return this.#id
  }

  /** Whether notes are stored under `workspaceId`, empty ones included. */
  async has(workspaceId: string): Promise<boolean> {
    return storedMarkdown(await this.storage.get(await notesKey(workspaceId))) !== null
  }

  /** True while a change waits to be written. */
  get dirty(): boolean {
    return this.#draft !== null
  }

  /**
   * Saves the current workspace's pending change, then loads the target's notes. Resolves null
   * when a later `open` overtook this one, so the caller drops a stale answer.
   */
  async open(target: NotesTarget): Promise<string | null> {
    const ticket = ++this.#opening
    await this.flush()
    const key = await notesKey(target.id)
    const markdown = (await this.#load(key, target)) ?? ''
    if (ticket !== this.#opening) return null
    this.#id = target.id
    this.#key = key
    this.#saved = markdown
    return markdown
  }

  /** Stops saving to any workspace, after writing what is pending. */
  async close(): Promise<void> {
    this.#opening++
    await this.flush()
    this.#id = null
    this.#key = null
  }

  /**
   * The notes under `key`, else the ones kept under the target's old path key, moved under `key`
   * so they follow the id from now on. The old entry goes only once the copy is stored; a failed
   * copy leaves it for the next open, and the notes show either way.
   */
  async #load(key: string, target: NotesTarget): Promise<string | null> {
    const markdown = storedMarkdown(await this.storage.get(key))
    if (markdown !== null || !target.legacyPath) return markdown
    const legacyKey = await legacyNotesKey(target.legacyPath)
    const legacy = await this.storage.get(legacyKey)
    const legacyMarkdown = storedMarkdown(legacy)
    if (!legacyMarkdown) return null
    const copy: StoredNotes = {
      workspaceId: target.id,
      markdown: legacyMarkdown,
      updatedAt: storedUpdatedAt(legacy)
    }
    try {
      await this.storage.set(key, copy)
    } catch {
      return legacyMarkdown // Still under the old key; the next open moves it.
    }
    try {
      await this.storage.delete(legacyKey)
    } catch {
      // The copy is stored and read first from now on; the old entry is only left behind.
    }
    return legacyMarkdown
  }

  /** The stored notes of the open workspace, for reloading after another panel wrote them. */
  async reload(): Promise<string | null> {
    if (!this.#key) return null
    const key = this.#key
    const markdown = storedMarkdown(await this.storage.get(key)) ?? ''
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
    const workspaceId = this.#id
    if (draft === null || key === null || workspaceId === null) return this.#writing
    this.#draft = null
    const value: StoredNotes = { workspaceId, markdown: draft, updatedAt: Date.now() }
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
