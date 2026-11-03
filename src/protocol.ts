// The panel <-> worker contract, declared once: panel/main.ts and src/worker.ts both read it.

/** The focused workspace, keyed by its path so renames keep the notes. */
export type FocusedWorkspace = { path: string; name: string; branch: string | null }

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
