import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HospitalUpdater, compareVersions, CACHE_MS, PACKAGE } from '../src/updater.js'

const sha = 'a'.repeat(40)
function setup({ version = '1.1.0', latest = '1.2.0', now = () => 1000, fetcher, manager = {} } = {}) {
  const urls = []
  let restored = false
  const calls = []
  const adapter = {
    change: async operation => { const result = {}; await operation(result); return result },
    configure: operation => operation(), readRestoredFiles: async () => new Map(),
    restoreFiles: async () => { restored = true },
    runPnpm: async (...args) => { calls.push(args); return { exitCode: 0 } }, ...manager,
  }
  const updater = new HospitalUpdater({ version, manager: adapter, now, verifyInstalled: async v => assert.equal(v, latest),
    fetcher: fetcher ?? (async url => {
      urls.push(url)
      return new Response(JSON.stringify(url.includes('/commits/') ? { sha } : {
        encoding: 'base64', content: Buffer.from(JSON.stringify({ name: PACKAGE, version: latest, dsh: { bundle: {} } })).toString('base64'),
      }))
    }),
  })
  return { updater, urls, calls, restored: () => restored }
}

test('stable version comparison handles numeric order and rejects pre-releases', () => {
  assert.equal(compareVersions('1.10.0', '1.9.9'), 1)
  assert.equal(compareVersions('1.1.0', '1.1.0+build'), 0)
  assert.throws(() => compareVersions('1.2.0-beta.1', '1.1.0'))
})

test('checks pin manifest to commit; cache and overlapping requests prevent duplicate fetches', async () => {
  let now = 1000
  const { updater, urls } = setup({ now: () => now })
  const first = updater.check(false)
  assert.equal(updater.check(true), first)
  assert.equal((await first).status, 'available')
  assert.ok(urls[1].endsWith(`?ref=${sha}`))
  await updater.check(false)
  assert.equal(urls.length, 2)
  await updater.check(true)
  assert.equal(urls.length, 4)
  now += CACHE_MS
  await updater.check(false)
  assert.equal(urls.length, 6)
})

test('equal/older version never becomes an update', async () => {
  for (const latest of ['1.1.0', '1.0.9']) {
    const { updater } = setup({ latest })
    assert.equal((await updater.check()).status, 'current')
    await assert.rejects(updater.update(sha), /失效/)
  }
})

test('GitHub failure and rate limit remain recoverable on manual retry', async () => {
  const { updater } = setup({ fetcher: async () => new Response('', { status: 403 }) })
  const state = await updater.check()
  assert.equal(state.status, 'error')
  assert.equal(state.commit, null)
  assert.match(state.message, /受限/)
  await assert.rejects(updater.update(sha))
})

test('update installs exact checked commit without uninstall/reload or lifecycle scripts', async () => {
  const { updater, calls } = setup()
  await updater.check()
  await assert.rejects(updater.update('b'.repeat(40)), /失效/)
  const installing = updater.update(sha)
  assert.equal(updater.update(sha), installing)
  const state = await installing
  assert.equal(state.status, 'restart-required')
  assert.equal(state.currentVersion, '1.1.0')
  assert.deepEqual(calls[0][0], ['add', `https://github.com/xrunda/dsh-plugin-hzhospital.git#${sha}`, '--ignore-scripts'])
  assert.equal(calls.length, 1)
  assert.equal((await updater.check(true)).status, 'restart-required')
})

test('installation failures restore DSH dependency records and allow a fresh check', async () => {
  const { updater, restored } = setup({ manager: { runPnpm: async () => ({ exitCode: 1 }) } })
  await updater.check()
  assert.equal((await updater.update(sha)).status, 'error')
  assert.equal(restored(), true)
  assert.equal(updater.getState().commit, null)
  assert.equal((await updater.check(true)).status, 'available')
})

test('invalid/wrong package and invalid commit cannot become install targets', async () => {
  const { updater } = setup({ fetcher: async () => new Response(JSON.stringify({ sha: 'bad' })) })
  assert.equal((await updater.check()).status, 'error')
  await assert.rejects(updater.update(sha))
})

test('unrecognized DSH adapter refuses self-update before making changes', async () => {
  const { updater, calls } = setup({ manager: { configure: undefined } })
  assert.equal((await updater.check()).canUpdate, false)
  await assert.rejects(updater.update(sha), /不兼容/)
  assert.equal(calls.length, 0)
})
