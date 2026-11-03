// Same matching as plugins/script-runner/src/workspace.ts; plugins cannot import across folders.

/** What `workspace.readContext` answers for the focused workspace. */
export type FocusedContext = { branch: string; displayName: string }
type Listed = { name: string; path: string; branch: string | null }

const shortBranch = (branch: string | null | undefined): string =>
  (branch ?? '').replace(/^refs\/heads\//, '')

/**
 * `workspace.readContext` names the focused workspace only by display name and branch, while
 * `workspace.list` carries paths: match on both, then on the name alone. Null when nothing matches
 * or the match is ambiguous.
 */
export function matchFocused<W extends Listed>(
  context: FocusedContext,
  workspaces: readonly W[]
): W | null {
  const named = workspaces.filter((workspace) => workspace.name === context.displayName)
  const exact = named.filter(
    (workspace) => shortBranch(workspace.branch) === shortBranch(context.branch)
  )
  if (exact.length === 1) return exact[0] ?? null
  if (exact.length === 0 && named.length === 1) return named[0] ?? null
  return null
}
