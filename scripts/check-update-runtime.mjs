/** Integration check against an installed DSH; uses only a temporary profile. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runInThisContext } from 'node:vm'

const asar = process.argv[2] ?? '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar'
const req = createRequire(`${asar}/dsh/package.json`)
const { Context, Service } = req('@deepseek-ai/cordis')
const { TypertRegistry } = req('@deepseek-ai/dsh-typert-registry')
const { TypertGatewayService } = req('@deepseek-ai/dsh-api-gateway')
const { PluginManager } = req('@deepseek-ai/dsh-plugin-manager')
const host = new Context()
new TypertRegistry(host)
class Access extends Service { constructor() { super(host, 'remoteAccess') } decide() { return { kind: 'deny', reason: 'test' } } }
new Access()
const gateway = new TypertGatewayService(host, { websocketHeartbeatIntervalMs: 30000, streamInboxBytes: 1024 * 1024 })
const dir = mkdtempSync(join(tmpdir(), 'hzh-update-runtime-'))
const sha = 'a'.repeat(40)
const restoreFetch = globalThis.fetch
let fetchCount = 0
try {
  class Manager extends Service {
    constructor() {
      super(host, 'pluginManager')
      this.profile = { dir }
      this.ownerContext = host
      this.abort = new AbortController()
      this.lockWaitMs = 1000
    }
    // Exercise real DSH transaction/locking/rollback code against temporary files.
    change(...args) { return PluginManager.prototype.change.apply(this, args) }
    configure(...args) { return PluginManager.prototype.configure.apply(this, args) }
    diskState() { return PluginManager.prototype.diskState.call(this) }
    readRestoredFiles() { return PluginManager.prototype.readRestoredFiles.call(this) }
    restoreFiles(...args) { return PluginManager.prototype.restoreFiles.apply(this, args) }
    async runPnpm(args) {
      assert.equal(args[0], 'add')
      assert.equal(args[1], `https://github.com/xrunda/dsh-plugin-hzhospital.git#${sha}`)
      assert.equal(args[2], '--ignore-scripts')
      writeFileSync(join(dir, 'package.json'), '{"name":"temporary-test-profile","changed":true}')
      writeFileSync(join(dir, 'pnpm-lock.yaml'), 'changed lock')
      if (this.failNext) { this.failNext = false; return { exitCode: 1 } }
      const file = join(dir, 'node_modules/dsh-plugin-hzhospital/package.json')
      writeFileSync(file, JSON.stringify({ name: 'dsh-plugin-hzhospital', version: '1.2.0', dsh: { bundle: {} } }))
      return { exitCode: 0 }
    }
  }
  new Manager()
  const { mkdirSync } = await import('node:fs')
  mkdirSync(join(dir, 'node_modules/dsh-plugin-hzhospital'), { recursive: true })
  writeFileSync(join(dir, 'package.json'), '{"name":"temporary-test-profile","private":true}')
  globalThis.fetch = async url => {
    fetchCount++
    const payload = `${sha} refs/heads/main\n`
    return new Response(url.includes('/info/refs') ? `${(Buffer.byteLength(payload) + 4).toString(16).padStart(4, '0')}${payload}0000` :
      JSON.stringify({ name: 'dsh-plugin-hzhospital', version: '1.2.0', dsh: { bundle: {} } }))
  }
  // Emulate only DSH's peer resolution; run the actual shipped host entry.
  globalThis.__hzhTestRequire = req
  const root = new URL('../', import.meta.url)
  let entry = readFileSync(new URL('index.js', root), 'utf8')
  entry = entry.replace("import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'", "const { TypertRemoteService } = globalThis.__hzhTestRequire('@deepseek-ai/dsh-typert-protocol')")
    .replace("import { scrubbedParentEnv } from '@deepseek-ai/dsh-subprocess'", "const { scrubbedParentEnv } = globalThis.__hzhTestRequire('@deepseek-ai/dsh-subprocess')")
    .replace("'./src/git-release.js'", JSON.stringify(new URL('src/git-release.js', root).href))
    .replace("import { z } from 'zod'", "const { z } = globalThis.__hzhTestRequire('zod')")
    .replace("'./src/updater.js'", JSON.stringify(new URL('src/updater.js', root).href))
    .replace("'./src/remote.cjs'", JSON.stringify(new URL('src/remote.cjs', root).href))
    .replace("new URL('./package.json', import.meta.url)", JSON.stringify(new URL('package.json', root).pathname))
  const plugin = await import(`data:text/javascript;base64,${Buffer.from(entry).toString('base64')}`)
  const fiber = host.plugin(plugin)
  await fiber
  const peer = { signal: new AbortController().signal, principal: { kind: 'owner' } }
  const call = (endpoint, payload, signal) => gateway.dispatchRpc(endpoint, payload, signal, peer)
  const client = new Context()
  new TypertRegistry(client)
  class Connection extends Service {
    constructor() {
      super(client, 'connection')
      this.interactions = 'none'
      this.isLoopback = true
      this.generation = { getSnapshot: () => undefined }
      this.rpc = { call: (_path, endpoint, payload, signal) => call(endpoint, payload, signal), open() {} }
    }
  }
  new Connection()
  let api
  const previousWindow = globalThis.window
  globalThis.window = { __ModuleLoader__: { load: value => { api = value.factory(req) } } }
  runInThisContext(readFileSync(`${asar}/dsh/node_modules/@deepseek-ai/dsh-api-gateway/lib/client.browser.js`, 'utf8'))
  globalThis.window = previousWindow
  api.apply(client)
  const components = new Map()
  class Slots extends Service {
    constructor() { super(client, 'slots') }
    inject(_key, callback) { return this.ctx.effect(callback) }
    register(options, component) { components.set(options.name, component); return () => components.delete(options.name) }
  }
  new Slots()
  const React = {
    createElement: (tag, props, ...children) => ({ tag, props, children }),
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
    useEffect: callback => callback(),
  }
  const browserRequire = name => name === 'react' ? React : req(name)
  let browserPlugin
  globalThis.window = { __ModuleLoader__: { load: value => { browserPlugin = value.factory(browserRequire) } } }
  runInThisContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'))
  globalThis.window = previousWindow
  await client.plugin(browserPlugin)
  for (let i = 0; i < 50 && !client.remote.hzhospitalUpdates; i++) await new Promise(resolve => setTimeout(resolve, 5))
  assert.ok(client.remote.hzhospitalUpdates, 'Actual browser artifact mounted its Remote namespace')
  // Startup effect fires on plugin load, even with the details page closed.
  for (let i = 0; i < 50 && host.hzhospitalUpdates.getState().status !== 'available'; i++) await new Promise(resolve => setTimeout(resolve, 5))
  assert.equal(host.hzhospitalUpdates.getState().status, 'available')
  await client.remote.hzhospitalUpdates.getState()
  const html = JSON.stringify(components.get('plugins.bundle.config')())
  assert.match(html, /更新到 1.2.0/)
  assert.match(html, /检查更新/)
  const brand = JSON.stringify(components.get('sidebar.brand.name')())
  assert.match(brand, /医院插件有新版本/)
  console.log('PASS: shipped browser artifact checks on load and renders update buttons and sidebar notice.')
  const state = await client.remote.hzhospitalUpdates.check(false)
  assert.equal(state.ok, true, JSON.stringify(state))
  assert.equal(state.value.status, 'available')
  assert.equal(fetchCount, 2)
  assert.equal((await client.remote.hzhospitalUpdates.check(false)).value.status, 'available')
  assert.equal(fetchCount, 2)
  const invalid = await client.remote.hzhospitalUpdates.update('invalid')
  assert.equal(invalid.ok, false)
  const beforeManifest = readFileSync(join(dir, 'package.json'), 'utf8')
  host.pluginManager.failNext = true
  assert.equal((await client.remote.hzhospitalUpdates.update(sha)).value.status, 'error')
  assert.equal(readFileSync(join(dir, 'package.json'), 'utf8'), beforeManifest)
  const { existsSync } = await import('node:fs')
  assert.equal(existsSync(join(dir, 'pnpm-lock.yaml')), false)
  assert.equal((await client.remote.hzhospitalUpdates.check(true)).value.status, 'available')
  const outcome = await client.remote.hzhospitalUpdates.update(sha)
  assert.equal(outcome.ok, true, JSON.stringify(outcome))
  assert.equal(outcome.value.status, 'restart-required', JSON.stringify(outcome))
  assert.equal((await client.remote.hzhospitalUpdates.getState()).value.status, 'restart-required')
  await client.fiber?.dispose()
  console.log('PASS: real DSH client RPC -> strict schemas -> host service -> DSH transaction -> restart result.')
  console.log('PASS: no real user profile, installed plugin, or DSH application files were modified.')
} finally {
  globalThis.fetch = restoreFetch
  delete globalThis.__hzhTestRequire
  await host.fiber?.dispose()
  rmSync(dir, { recursive: true, force: true })
}
