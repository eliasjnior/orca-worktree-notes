// The plugin's worker. Panels only learn the focused workspace's name and branch; the worker can
// list workspaces with their paths, so it tells the panel which path the notes belong to.
import type { OrcaWorkerApi } from 'orca/worker'
import type { FocusedAnswer } from './protocol'
import { matchFocused } from './workspace'

async function focused(orca: OrcaWorkerApi): Promise<FocusedAnswer> {
  const context = await orca.host.call('workspace.readContext')
  if (!context) return { workspace: null, error: null }
  const { workspaces } = await orca.host.call('workspace.list')
  const match = matchFocused(context, workspaces)
  if (!match) {
    return {
      workspace: null,
      error: `Could not match the focused workspace "${context.displayName}" to exactly one workspace in Orca.`
    }
  }
  return {
    workspace: { path: match.path, name: context.displayName, branch: context.branch || null },
    error: null
  }
}

export default function activate(orca: OrcaWorkerApi): void {
  orca.panels.handle('workspace.focused', () => focused(orca))
}
