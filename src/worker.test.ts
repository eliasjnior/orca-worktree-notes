import { assert, mockHost, mountWorker, test } from 'orca/testing'
import * as main from './worker'

const list = {
  workspaces: [
    { id: 'a', kind: 'worktree', name: 'api', path: '/wt/api-main', branch: 'main', hostId: null },
    { id: 'b', kind: 'worktree', name: 'api', path: '/wt/api-x', branch: 'feat/x', hostId: null }
  ],
  truncated: false
}

test('answers the focused worktree path', async () => {
  const host = mockHost({
    results: {
      'workspace.readContext': { branch: 'feat/x', displayName: 'api', terminals: [] },
      'workspace.list': list
    }
  })
  const worker = await mountWorker(main, { host })
  assert.deepEqual(await worker.request('workspace.focused'), {
    workspace: { path: '/wt/api-x', name: 'api', branch: 'feat/x' },
    error: null
  })
  assert.deepEqual(worker.refusals, [])
  await worker.deactivate()
})

test('answers no workspace, or why it could not tell which', async () => {
  const none = await mountWorker(main, {
    host: mockHost({ results: { 'workspace.readContext': null } })
  })
  assert.deepEqual(await none.request('workspace.focused'), { workspace: null, error: null })
  await none.deactivate()

  const unknown = await mountWorker(main, {
    host: mockHost({
      results: {
        'workspace.readContext': { branch: 'main', displayName: 'web', terminals: [] },
        'workspace.list': list
      }
    })
  })
  const answer = await unknown.request('workspace.focused')
  assert.equal(answer.workspace, null)
  assert.match(answer.error ?? '', /"web"/)
  await unknown.deactivate()
})
