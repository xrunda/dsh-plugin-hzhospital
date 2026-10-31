import { readFileSync } from 'node:fs'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'
import { HospitalUpdater, verifyInstalledPackage } from './src/updater.js'
import wire from './src/remote.cjs'

export const name = 'hzhospital-brand'
export const inject = ['pluginManager', 'typert']

export function apply(ctx) {
  const manager = ctx.pluginManager
  const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version
  const abort = new AbortController()
  const updater = new HospitalUpdater({ version, manager, signal: abort.signal,
    verifyInstalled: next => verifyInstalledPackage(manager, next) })
  class Updates extends TypertRemoteService {
    constructor() { super(ctx, 'hzhospitalUpdates') }
    getState() { return updater.getState() }
    check(force) { return updater.check(force) }
    update(commit) { return updater.update(commit) }
  }
  new Updates()
  ctx.typert.register({ package: 'dsh-plugin-hzhospital', face: 'host', schemas: [],
    invocations: wire.updateContribution(z).descriptors, model: { services: [], events: [], objects: [] } })
  ctx.effect(() => () => abort.abort(), 'hzhospital: cancel update requests')
}
