/** Run with the installed Electron binary in Node mode to read its ASAR dependencies. */
import { readFileSync, openSync, readSync, closeSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import assert from 'node:assert/strict'
import { homedir } from 'node:os'

const asar = process.argv[2] ?? '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar'
process.noAsar = true
const fd = openSync(asar, 'r')
process.noAsar = false
function read(size, offset) {
  const data = Buffer.alloc(size)
  assert.equal(readSync(fd, data, 0, size, offset), size)
  return data
}
try {
  const header = read(16, 0)
  const tree = JSON.parse(read(header.readUInt32LE(12), 16))
  const base = 8 + header.readUInt32LE(4)
  function file(path) {
    const entry = path.split('/').reduce((node, segment) => node.files[segment], tree)
    return read(entry.size, base + Number(entry.offset)).toString('utf8')
  }
  const require = createRequire(`${asar}/dsh/package.json`)
  const { parse } = require('yaml')
  const source = file('dsh/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js')
  const start = source.indexOf('function applyEntryPatches(')
  const end = source.indexOf('/** Loader entry tree', start)
  assert.ok(start >= 0 && end > start, 'Installed DSH patch function changed; inspect before updating this check')
  const apply = runInNewContext(`${source.slice(start, end)};applyEntryPatches`, { structuredClone })
  const official = { id: 'ui-brand-official', name: '@deepseek-ai/dsh-client-ui-brand-official' }
  const original = [{ id: official.id, name: 'dsh-plugin-hzhospital' }]
  const warnings = []
  const broken = apply([official], original, (...args) => warnings.push(args))
  assert.equal(warnings.length, 1, 'Reproduce the original name-mismatch failure')
  assert.equal(broken[0].name, official.name)

  const patch = parse(readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8'))
  const fixedWarnings = []
  const fixed = apply([official], patch, (...args) => fixedWarnings.push(args))
  assert.equal(fixedWarnings.length, 0)
  assert.equal(fixed.find(row => row.id === official.id).disabled, true)
  assert.equal(fixed.find(row => row.id === 'hzhospital-brand').name, 'dsh-plugin-hzhospital')

  const web = parse(file('dsh/node_modules/@deepseek-ai/dsh-web-app/cordis.patch.yml'), { logLevel: 'silent' })
  // These are the actual shipped Web roster insertions, followed by this bundle
  // and the current user's higher-priority profile patch.
  let roster = web.filter(row => row.insert && !row.id).flatMap(row => row.insert)
  roster = apply(roster, patch, () => {})
  const profile = parse(readFileSync(`${homedir()}/.dsh/profiles/desktop/cordis.patch.yml`, 'utf8'), { logLevel: 'silent' })
  roster = apply(roster, profile, () => {})
  const brands = roster.filter(row => /brand/.test(row.id) && !row.disabled)
  assert.deepEqual(JSON.parse(JSON.stringify(brands)), [{ id: 'hzhospital-brand', name: 'dsh-plugin-hzhospital' }])
  console.log('PASS: real DSH patch function reproduces 1.0.0 failure and accepts the fix.')
  console.log('PASS: installed Web roster + bundle + desktop user patch activate only hzhospital-brand.')
} finally { closeSync(fd) }
