/** Use the installed DSH's real compatibility checker, not a duplicate SemVer implementation. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

const asar = '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar'
const req = createRequire(`${asar}/dsh/package.json`)
const { evaluatePluginCompatibility } = req('@deepseek-ai/dsh-app-boot')
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const rejected = evaluatePluginCompatibility({ ...manifest, version: '1.1.1', peerDependencies: {
  ...manifest.peerDependencies, '@deepseek-ai/dsh-typert-protocol': '>=0.2.1-rc.5 <0.3.0',
} }, {}, '0.2.1-rc.3')
assert.ok(rejected, 'Reproduce the hospital installation rejection in 1.1.1')
for (const runtime of ['0.2.1-rc.3', '0.2.1-rc.5']) {
  assert.equal(evaluatePluginCompatibility(manifest, {}, runtime), undefined, `Plugin must install on DSH ${runtime}`)
}
for (const runtime of ['0.2.1-rc.2', '0.3.0']) {
  assert.ok(evaluatePluginCompatibility(manifest, {}, runtime), `Do not silently allow unverified DSH ${runtime}`)
}
console.log('PASS: DSH rejects the old requirement on rc.3 and accepts this release on rc.3/rc.5.')

// Optionally compare unpacked official rc.3 npm packages with this installed rc.5 runtime.
// Layout: <dir>/<package-name>/package/lib/..., as produced by unpacking npm tarballs.
if (process.argv[2]) {
  const root = resolve(process.argv[2])
  const files = {
    'dsh-typert-protocol': ['lib/index.js'],
    'dsh-typert-registry': ['lib/index.js'],
    'dsh-api-gateway': ['lib/index.js', 'lib/client.browser.js'],
    'dsh-plugin-manager': ['lib/index.js'],
  }
  const hash = data => createHash('sha256').update(data).digest('hex')
  for (const [name, paths] of Object.entries(files)) {
    const source = `${root}/${name}/package`
    assert.equal(JSON.parse(readFileSync(`${source}/package.json`, 'utf8')).version, '0.2.1-rc.3')
    for (const file of paths) {
      assert.equal(hash(readFileSync(`${source}/${file}`)),
        hash(readFileSync(`${asar}/dsh/node_modules/@deepseek-ai/${name}/${file}`)), `${name}/${file} changed; review the difference before declaring compatibility`)
    }
  }
  const uiPath = 'dsh-client-ui-plugin-manager/package/lib/client.js'
  const rc3UI = readFileSync(`${root}/${uiPath}`, 'utf8')
  const currentUI = readFileSync(`${asar}/dsh/node_modules/@deepseek-ai/dsh-client-ui-plugin-manager/lib/client.js`, 'utf8')
  // UI CSS hashes differ by build machine; verify the extension contract itself.
  for (const source of [rc3UI, currentUI]) {
    assert.match(source, /"plugins\.bundle\.config": \{\s*kind: "keyed",\s*scope: "root"/)
    assert.ok(source.includes('renderSlot("plugins.bundle.config", { view: "page" }, { entryKey: pkg.name })'))
  }
  console.log('PASS: official rc.3 RPC, registry and package transaction artifacts match tested rc.5 byte for byte; the plugin detail extension contract also matches.')
}
