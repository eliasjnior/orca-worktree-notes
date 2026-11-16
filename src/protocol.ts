// The panel <-> worker contract, declared once: panel/main.ts and src/worker.ts both read it.

/** The focused workspace, keyed by the id Orca gives it so renames keep the notes. */
export type FocusedWorkspace = {
  /**
   * What `workspace.readContext` names it. Panels see it only for `identity:` and `folder:` ids;
   * a workspace on a paired Orca server has a raw id, which Orca gives the worker alone.
   */
  id: string
  /** The path its notes were kept under up to 1.2, or null when Orca does not list it. */
  legacyPath: string | null
  name: string
  branch: string | null
}

export type FocusedAnswer = {
  /** Null when no workspace is focused or it could not be identified. */
  workspace: FocusedWorkspace | null
  /** Why a focused workspace could not be identified. */
  error: string | null
}

declare module 'orca' {
  interface PluginRequests {
    /** Which workspace the notes belong to right now. */
    'workspace.focused': { output: FocusedAnswer }
  }
}
