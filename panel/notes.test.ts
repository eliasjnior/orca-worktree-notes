import { assert, test } from 'orca/testing'
import { NotesSession, type NotesStorage, notesKey, PathCache, type SaveState } from './notes'

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
    }
  }
  return storage
}

const markdownAt = async (storage: { data: Map<string, Json> }, path: string) =>
  (storage.data.get(await notesKey(path)) as { markdown?: string } | undefined)?.markdown

test('keys are stable per path and free of path characters', async () => {
  assert.equal(await notesKey('/a/b'), await notesKey('/a/b'))
  assert.notEqual(await notesKey('/a/b'), await notesKey('/a/c'))
  assert.match(await notesKey('/a/b'), /^notes\/[0-9a-f]{32}$/)
})

test('loads, debounces and saves each workspace separately', async () => {
  const storage = memoryStorage({
    [await notesKey('/wt/a')]: { path: '/wt/a', markdown: '# A', updatedAt: 1 }
  })
  const states: SaveState[] = []
  const session = new NotesSession(storage, { debounceMs: 5, onState: (s) => states.push(s) })

  assert.equal(await session.open('/wt/a'), '# A')
  session.change('# A\n\n- one')
  session.change('# A\n\n- one\n- two')
  assert.equal(session.dirty, true)
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(await markdownAt(storage, '/wt/a'), '# A\n\n- one\n- two')
  assert.deepEqual(states, ['pending', 'pending', 'saving', 'saved'])

  // Switching flushes the pending change to the old workspace first.
  session.change('# A edited')
  assert.equal(await session.open('/wt/b'), '')
  assert.equal(await markdownAt(storage, '/wt/a'), '# A edited')
  session.change('B notes')
  await session.flush()
  assert.equal(await markdownAt(storage, '/wt/b'), 'B notes')
  assert.equal(await markdownAt(storage, '/wt/a'), '# A edited')
})

test('a later open wins over a slower earlier one', async () => {
  const session = new NotesSession(memoryStorage())
  const [first, second] = await Promise.all([session.open('/wt/a'), session.open('/wt/b')])
  assert.equal(first, null)
  assert.equal(second, '')
  assert.equal(session.path, '/wt/b')
})

test('keeps a failed write for the next try, and never writes after close', async () => {
  const storage = memoryStorage()
  const session = new NotesSession(storage, { debounceMs: 1000 })
  await session.open('/wt/a')
  storage.fail = true
  session.change('draft')
  await session.flush()
  assert.equal(session.dirty, true)
  storage.fail = false
  await session.flush()
  assert.equal(await markdownAt(storage, '/wt/a'), 'draft')

  await session.close()
  session.change('ignored')
  assert.equal(session.dirty, false)
})

test('does not write when nothing changed', async () => {
  const storage = memoryStorage({
    [await notesKey('/wt/a')]: { path: '/wt/a', markdown: 'same', updatedAt: 1 }
  })
  const session = new NotesSession(storage, { debounceMs: 1000 })
  await session.open('/wt/a')
  session.change('same')
  assert.equal(session.dirty, false)
  await session.open('/wt/b')
  session.change('')
  assert.equal(session.dirty, false)
  assert.equal(storage.data.has(await notesKey('/wt/b')), false)
})

test('remembers the path of each workspace name and branch, newest kept', async () => {
  const storage = memoryStorage()
  const cache = new PathCache(storage)
  const api = { displayName: 'api', branch: 'main' }
  assert.equal(await cache.get(api), null)
  await cache.remember(api, '/wt/api')
  await cache.remember({ displayName: 'api', branch: 'feat/x' }, '/wt/api-x')
  assert.equal(await cache.get(api), '/wt/api')
  assert.equal(await cache.get({ displayName: 'api', branch: 'feat/x' }), '/wt/api-x')

  for (let i = 0; i < 250; i++)
    await cache.remember({ displayName: `w${i}`, branch: '' }, `/w/${i}`)
  const stored = storage.data.get('paths') as Record<string, string>
  assert.equal(Object.keys(stored).length, 200)
  assert.equal(await cache.get({ displayName: 'w249', branch: '' }), '/w/249')
  assert.equal(await cache.get(api), null)
})
