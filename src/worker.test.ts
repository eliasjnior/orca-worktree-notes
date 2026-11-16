import { assert, mockHost, mountWorker, test } from 'orca/testing'
import * as main from './worker'

const list = {
  workspaces: [
    {
      id: 'identity:wt2:local:a',
      kind: 'worktree',
      name: 'api',
      path: '/wt/api',
      branch: 'main',
      hostId: 'local'
    },
    {
      id: 'identity:wt2:local:b',
      kind: 'worktree',
      name: 'api',
      path: '/wt/api-x',
      branch: 'main',
      hostId: 'local'
    }
  ],
  truncated: false
}

const context = (workspaceId: string | undefined, displayName = 'api', branch = 'main') => ({
  ...(workspaceId ? { workspaceId } : {}),
  branch,
  displayName,
  terminals: []
})

test('answers the focused workspace id, and the path its old notes were kept under', async () => {
  const host = mockHost({
    results: {
      'workspace.readContext': context('identity:wt2:local:b'),
      'workspace.list': list
    }
  })
  const worker = await mountWorker(main, { host })
  assert.deepEqual(await worker.request('workspace.focused'), {
    workspace: { id: 'identity:wt2:local:b', legacyPath: '/wt/api-x', name: 'api', branch: 'main' },
    error: null
  })
  assert.deepEqual(worker.refusals, [])
  await worker.deactivate()
})

test('answers a workspace on a paired Orca server, which Orca does not list', async () => {
  const id = 'b5288d53::/home/me/orca/workspaces/distribution-ui/SYC-8772'
  const host = mockHost({
    results: {
      'workspace.readContext': context(id, 'SYC-8772', 'SYC-8772'),
      'workspace.list': list
    }
  })
  const worker = await mountWorker(main, { host })
  assert.deepEqual(await worker.request('workspace.focused'), {
    workspace: { id, legacyPath: null, name: 'SYC-8772', branch: 'SYC-8772' },
    error: null
  })
  await worker.deactivate()
})

test('answers no workspace, or why it could not tell which', async () => {
  const none = await mountWorker(main, {
    host: mockHost({ results: { 'workspace.readContext': null } })
  })
  assert.deepEqual(await none.request('workspace.focused'), { workspace: null, error: null })
  await none.deactivate()

  const unnamed = await mountWorker(main, {
    host: mockHost({
      results: { 'workspace.readContext': context(undefined, 'web'), 'workspace.list': list }
    })
  })
  const answer = await unnamed.request('workspace.focused')
  assert.equal(answer.workspace, null)
  assert.match(answer.error ?? '', /"web"/)
  await unnamed.deactivate()
})
