import { assert, test } from 'orca/testing'
import { legacyNotesKey, NotesSession, type NotesStorage, notesKey, type SaveState } from './notes'

type Json = Parameters<NotesStorage['set']>[1]

function memoryStorage(initial: Record<string, Json> = {}) {
  const data = new Map<string, Json>(Object.entries(initial))
  const storage: NotesStorage & { data: Map<string, Json>; fail: boolean } = {
    data,
    fail: false,
    get: async (key) => data.get(key) ?? null,
    set: async (key, value) => {
      if (storage.fail) throw new Error('disk full')
      data.set(key, value)
    },
    delete: async (key) => {
      if (storage.fail) throw new Error('disk full')
      data.delete(key)
    }
  }
  return storage
}

const markdownAt = async (storage: { data: Map<string, Json> }, id: string) =>
  (storage.data.get(await notesKey(id)) as { markdown?: string } | undefined)?.markdown

test('keys are stable per workspace id, free of path characters, and apart from path keys', async () => {
  assert.equal(await notesKey('identity:a'), await notesKey('identity:a'))
  assert.notEqual(await notesKey('identity:a'), await notesKey('identity:b'))
  assert.match(await notesKey('repo::/a/b'), /^workspace-notes\/[0-9a-f]{32}$/)
  assert.match(await legacyNotesKey('/a/b'), /^notes\/[0-9a-f]{32}$/)
  assert.notEqual(await notesKey('/a/b'), await legacyNotesKey('/a/b'))
})

test('loads, debounces and saves each workspace separately', async () => {
  const storage = memoryStorage({
    [await notesKey('a')]: { workspaceId: 'a', markdown: '# A', updatedAt: 1 }
  })
  const states: SaveState[] = []
  const session = new NotesSession(storage, { debounceMs: 5, onState: (s) => states.push(s) })

  assert.equal(await session.open({ id: 'a' }), '# A')
  session.change('# A\n\n- one')
  session.change('# A\n\n- one\n- two')
  assert.equal(session.dirty, true)
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(await markdownAt(storage, 'a'), '# A\n\n- one\n- two')
  assert.deepEqual(states, ['pending', 'pending', 'saving', 'saved'])
  assert.equal((storage.data.get(await notesKey('a')) as { workspaceId?: string }).workspaceId, 'a')

  // Switching flushes the pending change to the old workspace first.
  session.change('# A edited')
  assert.equal(await session.open({ id: 'b' }), '')
  assert.equal(await markdownAt(storage, 'a'), '# A edited')
  session.change('B notes')
  await session.flush()
  assert.equal(await markdownAt(storage, 'b'), 'B notes')
  assert.equal(await markdownAt(storage, 'a'), '# A edited')
})

test('knows which workspaces have notes stored', async () => {
  const storage = memoryStorage({
    [await notesKey('a')]: { workspaceId: 'a', markdown: '', updatedAt: 1 }
  })
  const session = new NotesSession(storage)
  assert.equal(await session.has('a'), true)
  assert.equal(await session.has('b'), false)
})

test('moves notes kept under the old path key once the copy is stored', async () => {
  const legacy = { path: '/wt/a', markdown: '# Old', updatedAt: 7 }
  const storage = memoryStorage({ [await legacyNotesKey('/wt/a')]: legacy })
  const session = new NotesSession(storage)

  assert.equal(await session.open({ id: 'a', legacyPath: '/wt/a' }), '# Old')
  assert.deepEqual(storage.data.get(await notesKey('a')), {
    workspaceId: 'a',
    markdown: '# Old',
    updatedAt: 7
  })
  assert.equal(storage.data.has(await legacyNotesKey('/wt/a')), false)
  assert.equal(session.dirty, false)
})

test('never lets old path notes replace notes already kept under the id', async () => {
  const storage = memoryStorage({
    [await legacyNotesKey('/wt/a')]: { path: '/wt/a', markdown: '# Old', updatedAt: 7 },
    [await notesKey('a')]: { workspaceId: 'a', markdown: '', updatedAt: 9 }
  })
  const session = new NotesSession(storage)
  assert.equal(await session.open({ id: 'a', legacyPath: '/wt/a' }), '')
  assert.equal(await markdownAt(storage, 'a'), '')
  assert.equal(storage.data.has(await legacyNotesKey('/wt/a')), true)
})

test('keeps old path notes when copying them fails, and moves them on the next open', async () => {
  const storage = memoryStorage({
    [await legacyNotesKey('/wt/a')]: { path: '/wt/a', markdown: '# Old', updatedAt: 7 }
  })
  const session = new NotesSession(storage)
  storage.fail = true
  assert.equal(await session.open({ id: 'a', legacyPath: '/wt/a' }), '# Old')
  assert.equal(storage.data.has(await notesKey('a')), false)
  assert.equal(storage.data.has(await legacyNotesKey('/wt/a')), true)

  storage.fail = false
  await session.close()
  assert.equal(await session.open({ id: 'a', legacyPath: '/wt/a' }), '# Old')
  assert.equal(await markdownAt(storage, 'a'), '# Old')
  assert.equal(storage.data.has(await legacyNotesKey('/wt/a')), false)
})

test('keeps the copy when removing the old entry fails', async () => {
  const storage = memoryStorage({
    [await legacyNotesKey('/wt/a')]: { path: '/wt/a', markdown: '# Old', updatedAt: 7 }
  })
  storage.delete = async () => {
    throw new Error('busy')
  }
  const session = new NotesSession(storage)
  assert.equal(await session.open({ id: 'a', legacyPath: '/wt/a' }), '# Old')
  assert.equal(await markdownAt(storage, 'a'), '# Old')
})

test('a later open wins over a slower earlier one', async () => {
  const session = new NotesSession(memoryStorage())
  const [first, second] = await Promise.all([session.open({ id: 'a' }), session.open({ id: 'b' })])
  assert.equal(first, null)
  assert.equal(second, '')
  assert.equal(session.id, 'b')
})

test('keeps a failed write for the next try, and never writes after close', async () => {
  const storage = memoryStorage()
  const session = new NotesSession(storage, { debounceMs: 1000 })
  await session.open({ id: 'a' })
  storage.fail = true
  session.change('draft')
  await session.flush()
  assert.equal(session.dirty, true)
  storage.fail = false
  await session.flush()
  assert.equal(await markdownAt(storage, 'a'), 'draft')

  await session.close()
  session.change('ignored')
  assert.equal(session.dirty, false)
})

test('does not write when nothing changed', async () => {
  const storage = memoryStorage({
    [await notesKey('a')]: { workspaceId: 'a', markdown: 'same', updatedAt: 1 }
  })
  const session = new NotesSession(storage, { debounceMs: 1000 })
  await session.open({ id: 'a' })
  session.change('same')
  assert.equal(session.dirty, false)
  await session.open({ id: 'b' })
  session.change('')
  assert.equal(session.dirty, false)
  assert.equal(storage.data.has(await notesKey('b')), false)
})
