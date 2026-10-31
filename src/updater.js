import { readFileSync } from 'node:fs'

export const PACKAGE = 'dsh-plugin-hzhospital'
export const REPOSITORY = 'xrunda/dsh-plugin-hzhospital'
export const CACHE_MS = 15 * 60 * 1000
const SHA = /^[a-f0-9]{40}$/

// Stable releases only. A numerically older release must never replace a newer one.
export function compareVersions(a, b) {
  const parse = value => {
    const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[\w.-]+)?$/.exec(value)
    if (!match) throw new Error(`不支持的正式版本号：${value}`)
    return match.slice(1, 4).map(BigInt)
  }
  const x = parse(a), y = parse(b)
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1
  return 0
}

export class HospitalUpdater {
  constructor({ version, manager, fetcher = fetch, now = Date.now, signal, verifyInstalled }) {
    this.manager = manager
    this.fetcher = fetcher
    this.now = now
    this.signal = signal
    this.verifyInstalled = verifyInstalled
    this.state = { currentVersion: version, status: 'idle', checkedAt: null, latestVersion: null, commit: null,
      message: '尚未检查更新', canUpdate: this.supported() }
    this.checking = null
    this.installing = null
  }
  supported() {
    // DSH has no public in-place self-update endpoint. Reuse its package manager
    // transaction with capability checks, without unloading our own running fiber.
    return ['change', 'configure', 'runPnpm', 'readRestoredFiles', 'restoreFiles'].every(key => typeof this.manager?.[key] === 'function')
  }
  getState() { return { ...this.state } }
  async json(url) {
    const signal = this.signal ? AbortSignal.any([this.signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000)
    const response = await this.fetcher(url, { signal, headers: { Accept: 'application/vnd.github+json', 'User-Agent': PACKAGE } })
    if (!response.ok) {
      if (response.status === 403 || response.status === 429) throw new Error('GitHub 请求受限，请稍后手动重试')
      throw new Error(`无法访问 GitHub（HTTP ${response.status}）`)
    }
    const text = await response.text()
    if (text.length > 256 * 1024) throw new Error('更新信息过大，已拒绝读取')
    return JSON.parse(text)
  }
  check(force = false) {
    if (typeof force !== 'boolean') return Promise.reject(new Error('检查参数无效'))
    if (this.installing || this.state.status === 'restart-required') return Promise.resolve(this.getState())
    if (this.checking) return this.checking
    if (!force && this.state.checkedAt !== null && this.now() - this.state.checkedAt < CACHE_MS) return Promise.resolve(this.getState())
    this.checking = this.performCheck().finally(() => { this.checking = null })
    return this.checking
  }
  async performCheck() {
    this.state = { ...this.state, status: 'checking', message: '正在检查 GitHub…' }
    try {
      const head = await this.json(`https://api.github.com/repos/${REPOSITORY}/commits/main`)
      if (!SHA.test(head.sha)) throw new Error('GitHub 返回的提交编号无效')
      const content = await this.json(`https://api.github.com/repos/${REPOSITORY}/contents/package.json?ref=${head.sha}`)
      if (content.encoding !== 'base64' || typeof content.content !== 'string') throw new Error('版本文件格式无效')
      const manifest = JSON.parse(Buffer.from(content.content, 'base64').toString('utf8'))
      if (manifest.name !== PACKAGE || !manifest.dsh?.bundle) throw new Error('更新源不是医院插件')
      const newer = compareVersions(manifest.version, this.state.currentVersion) > 0
      this.state = { ...this.state, status: newer ? 'available' : 'current', checkedAt: this.now(),
        latestVersion: manifest.version, commit: head.sha, canUpdate: this.supported(),
        message: newer ? `发现新版本 ${manifest.version}` : '当前已是最新版本' }
    } catch (error) {
      this.state = { ...this.state, status: 'error', checkedAt: this.now(), commit: null, latestVersion: null,
        message: this.signal?.aborted ? '插件已停用' : `检查失败：${error.name === 'TimeoutError' ? '连接 GitHub 超时' : error.message}` }
    }
    return this.getState()
  }
  update(commit) {
    if (this.installing) return this.installing
    if (!this.supported()) return Promise.reject(new Error('当前 DSH 安装接口不兼容，请从插件页手动重新安装'))
    if (this.state.status !== 'available' || !SHA.test(commit) || commit !== this.state.commit) {
      return Promise.reject(new Error('更新目标已失效，请重新检查版本'))
    }
    const version = this.state.latestVersion
    this.state = { ...this.state, status: 'installing', message: `正在安装 ${version}，请勿退出 DSH…` }
    this.installing = this.performUpdate(commit, version).finally(() => { this.installing = null })
    return this.installing
  }
  async performUpdate(commit, version) {
    const manager = this.manager
    try {
      const outcome = await manager.change(async result => {
        // The same lock ordering as DSH: profile file lock, then HMR exclusion.
        await manager.configure(async () => {
          const files = await manager.readRestoredFiles()
          try {
            const run = await manager.runPnpm(['add', `https://github.com/${REPOSITORY}.git#${commit}`, '--ignore-scripts'], this.signal)
            if (run.exitCode !== 0 || run.timedOut || run.incompatible) throw new Error('下载或安装失败；原版本的依赖记录已恢复，请检查网络后重试')
            await this.verifyInstalled(version)
          } catch (error) {
            await manager.restoreFiles(files)
            throw error
          }
        })
        // Keep the currently loaded code alive; no removeBundle or reload call.
        result.application = 'restart-required'
        result.restartReason = 'host-module'
        result.bundle = PACKAGE
        result.version = version
      }, { stage: 'install', target: PACKAGE, enabled: true }, 'install')
      if (outcome.error || outcome.application === 'failed' || outcome.application === 'cancelled') {
        throw new Error(outcome.error?.diagnostic || '更新未完成，原版本继续运行')
      }
      this.state = { ...this.state, status: 'restart-required', message: `已安装 ${version}，请完全退出并重新打开 DSH 后生效` }
    } catch (error) {
      this.state = { ...this.state, status: 'error', commit: null, message: `更新失败：${error.message}` }
    }
    return this.getState()
  }
}

export function verifyInstalledPackage(manager, version) {
  const file = `${manager.profile.dir}/node_modules/${PACKAGE}/package.json`
  const manifest = JSON.parse(readFileSync(file, 'utf8'))
  if (manifest.name !== PACKAGE || manifest.version !== version || !manifest.dsh?.bundle) throw new Error('安装结果与检测版本不一致，已恢复原依赖记录')
}
