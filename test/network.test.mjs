import { test } from 'node:test'
import assert from 'node:assert/strict'
import { access, stat } from 'node:fs/promises'
import { gitReleaseReader } from '../src/git-release.js'
import { HospitalUpdater, networkFailure, PACKAGE } from '../src/updater.js'

const commit = 'b'.repeat(40)
const manifest = { name: PACKAGE, version: '1.2.0', dsh: { bundle: {} } }
const failure = new TypeError('fetch failed', { cause: Object.assign(new Error('redacted proxy address'), { code: 'ECONNRESET' }) })

test('HTTP fetch failure falls back to Git metadata and retains the exact update target', async () => {
  let gitChecks = 0
  const updater = new HospitalUpdater({ version: '1.1.3', manager: {}, fetcher: async () => { throw failure },
    readRelease: async () => { gitChecks++; return { commit, manifest } },
  })
  const state = await updater.check(true)
  assert.equal(state.status, 'available')
  assert.equal(state.commit, commit)
  assert.equal(state.latestVersion, manifest.version)
  assert.match(state.message, /Git 安装源/)
  assert.equal(gitChecks, 1)
})

test('raw host blocked while GitHub refs work also uses the install source fallback', async () => {
  const payload = `${commit} refs/heads/main\n`
  const updater = new HospitalUpdater({ version: '1.1.3', manager: {}, fetcher: async url => {
    if (url.includes('raw.githubusercontent.com')) throw failure
    return new Response((Buffer.byteLength(payload) + 4).toString(16).padStart(4, '0') + payload + '0000')
  }, readRelease: async () => ({ commit, manifest }) })
  assert.equal((await updater.check()).status, 'available')
})

test('HTTP and Git failure identify both routes without exposing proxy credentials', async () => {
  const updater = new HospitalUpdater({ version: '1.1.3', manager: {}, fetcher: async () => { throw failure },
    readRelease: async () => { throw new Error('Git 安装源连接超时') },
  })
  const state = await updater.check()
  assert.equal(state.status, 'error')
  assert.match(state.message, /github.com/)
  assert.match(state.message, /ECONNRESET/)
  assert.match(state.message, /Git 安装源连接超时/)
  assert.doesNotMatch(state.message, /redacted/)
})

test('DNS, TLS and aggregate network errors expose useful categories only', () => {
  for (const [code, expected] of [['ENOTFOUND', /DNS/], ['ECONNREFUSED', /连接被拒绝/], ['CERT_HAS_EXPIRED', /证书/], ['UND_ERR_CONNECT_TIMEOUT', /超时/]]) {
    const error = new TypeError('fetch failed', { cause: new AggregateError([Object.assign(new Error('secret'), { code })]) })
    const result = networkFailure(error, 'https://raw.githubusercontent.com/path')
    assert.match(result, expected)
    assert.match(result, /raw.githubusercontent.com/)
    assert.doesNotMatch(result, /secret/)
  }
})

test('Git fallback reads only objects, inherits install environment and removes temporary data', async () => {
  const calls = []
  let temp
  const read = gitReleaseReader({ cwd: process.cwd(), env: { HTTPS_PROXY: 'http://test-proxy:8080', PATH: process.env.PATH },
    execute: async (executable, args, options) => {
      calls.push(args)
      assert.equal(executable, 'git')
      assert.equal(options.env.HTTPS_PROXY, 'http://test-proxy:8080')
      assert.equal(options.env.GIT_TERMINAL_PROMPT, '0')
      assert.equal(options.windowsHide, true)
      assert.ok(args.some(arg => arg === 'credential.helper='))
      assert.ok(args.some(arg => arg.startsWith('core.hooksPath=')))
      if (args.includes('ls-remote')) return { stdout: `${commit}\trefs/heads/main\n` }
      if (args.includes('init')) { temp = args.at(-1); assert.ok((await stat(temp)).isDirectory()) }
      if (args.includes('show')) { assert.equal(args.at(-1), `${commit}:package.json`); return { stdout: JSON.stringify(manifest) } }
      return { stdout: '' }
    } })
  assert.deepEqual(await read(), { commit, manifest })
  assert.equal(calls.length, 4)
  assert.ok(calls.some(args => args.includes('--no-recurse-submodules')))
  assert.ok(calls.every(args => !args.includes('checkout') && !args.includes('clone')))
  await assert.rejects(access(temp))
})

test('Git errors redact credentials and clean up temporary repository', async () => {
  const read = gitReleaseReader({ cwd: process.cwd(), env: {}, execute: async () => {
    const error = new Error('https://user:password@proxy.invalid')
    error.stderr = 'proxy authentication required (407)'
    throw error
  } })
  await assert.rejects(read(), error => /Git 代理需要认证/.test(error.message) && !error.message.includes('password'))
})
