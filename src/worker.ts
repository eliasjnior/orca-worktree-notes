// The plugin's worker. Orca gives panels the focused workspace's id only when it holds no path, so
// a workspace on a paired Orca server reaches panels without one; the worker always gets it, and
// looks up the path the workspace's notes were kept under before they were keyed by id.
import type { OrcaWorkerApi } from 'orca/worker'
import type { FocusedAnswer } from './protocol'

async function focused(orca: OrcaWorkerApi): Promise<FocusedAnswer> {
  const context = await orca.host.call('workspace.readContext')
  if (!context) return { workspace: null, error: null }
  const id = context.workspaceId
  if (!id) {
    return {
      workspace: null,
      error: `Orca did not identify the focused workspace "${context.displayName}", so its notes cannot be kept apart.`
    }
  }
  // Only workspaces Orca lists can have notes from before 1.3, which were keyed by this path.
  const { workspaces } = await orca.host.call('workspace.list')
  const legacyPath = workspaces.find((workspace) => workspace.id === id)?.path ?? null
  return {
    workspace: { id, legacyPath, name: context.displayName, branch: context.branch || null },
    error: null
  }
}

export default function activate(orca: OrcaWorkerApi): void {
  orca.panels.handle('workspace.focused', () => focused(orca))
}
