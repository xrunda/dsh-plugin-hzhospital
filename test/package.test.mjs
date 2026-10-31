import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { createHash } from 'node:crypto'

const root = new URL('../', import.meta.url)
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'))
const artifact = readFileSync(new URL('lib/client.js', root), 'utf8')

test('shipped browser artifact registers lazily and uses only host React', () => {
  let registration
  runInNewContext(artifact, { window: { __ModuleLoader__: { load(value) { registration = value } } } })
  assert.equal(registration.id, pkg.name)
  const requests = []
  const plugin = registration.factory(id => {
    requests.push(id)
    assert.equal(id, 'react')
    return { createElement: (tag, props, ...children) => ({ tag, props, children }) }
  })
  assert.deepEqual(requests, ['react'])
  assert.equal(typeof plugin.apply, 'function')
  const components = new Map()
  // Execute the declaration-aware callbacks to inspect the actual shipped UI.
  plugin.apply({ slots: {
    inject(key, callback) {
      assert.ok(['sidebar.brand.mark', 'sidebar.brand.name'].includes(key))
      const result = callback()
      if (result?.[Symbol.iterator]) Array.from(result)
    },
    register({ name }, component) { components.set(name, component) },
  } })
  assert.equal(components.size, 2)
  const mark = components.get('sidebar.brand.mark')({ size: 24 })
  assert.equal(mark.props.style.width, 24)
  const img = mark.children[0]
  assert.equal(img.props.alt, '菏泽市中医医院')
  assert.ok(img.props.src.startsWith('data:image/png;base64,'))
  const decoded = Buffer.from(img.props.src.split(',')[1], 'base64')
  const original = readFileSync(new URL('assets/hztxt_logo.png', root))
  assert.equal(createHash('sha256').update(decoded).digest('hex'), createHash('sha256').update(original).digest('hex'))
  assert.equal(img.props.width / img.props.height, 4140 / 640)
  const name = components.get('sidebar.brand.name')()
  assert.equal(name.children[0].props.style.marginLeft, -24)
})

test('all manifest exports and bundle patch ship without install scripts', () => {
  for (const file of Object.values(pkg.exports)) assert.ok(readFileSync(new URL(file, root)).length)
  assert.ok(readFileSync(new URL(pkg.dsh.bundle.patch, root), 'utf8').includes('id: ui-brand-official'))
  for (const lifecycle of ['prepare', 'install', 'postinstall', 'preinstall']) assert.equal(pkg.scripts[lifecycle], undefined)
  assert.equal(Object.keys(pkg.dependencies ?? {}).length, 0)
})
