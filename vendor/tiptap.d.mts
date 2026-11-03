// The part of the vendored Tiptap bundle (vendor/tiptap.mjs) the panel uses.

/** An extension, configured or not; the panel only passes these to the editor. */
export type AnyExtension = { readonly name: string }
type Configurable<O> = AnyExtension & { configure(options?: Partial<O>): AnyExtension }

export type EditorOptions = {
  element: Element
  extensions: AnyExtension[]
  content?: string
  contentType?: 'markdown' | 'html' | 'json'
  editable?: boolean
  autofocus?: boolean | 'start' | 'end'
  editorProps?: { attributes?: Record<string, string> }
  onUpdate?: (props: { editor: Editor }) => void
}

export class Editor {
  constructor(options: EditorOptions)
  readonly isEmpty: boolean
  readonly isFocused: boolean
  readonly commands: {
    setContent(
      content: string,
      options?: { contentType?: 'markdown' | 'html'; emitUpdate?: boolean }
    ): boolean
    focus(position?: 'start' | 'end'): boolean
  }
  getMarkdown(): string
  setEditable(editable: boolean, emitUpdate?: boolean): void
  destroy(): void
}

export const StarterKit: Configurable<{
  link: false | { openOnClick?: boolean; autolink?: boolean; linkOnPaste?: boolean }
  heading: false | { levels?: number[] }
}>
export const Markdown: Configurable<{ markedOptions: { gfm?: boolean } }>
export const TaskList: Configurable<Record<string, never>>
export const TaskItem: Configurable<{ nested: boolean }>
export const Placeholder: Configurable<{ placeholder: string }>
