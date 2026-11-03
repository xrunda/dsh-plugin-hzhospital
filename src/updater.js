import { readFileSync } from 'node:fs'

export const PACKAGE = 'dsh-plugin-hzhospital'
// The update source is the company GitLab mirror, reachable from the hospital
// intranet; GitHub remains the development mirror only.
export const REPO_URL = 'https://git.xrunda.com/mdt/dsh-plugin-hzhospital.git'
export const RAW_BASE = 'https://git.xrunda.com/mdt/dsh-plugin-hzhospital/-/raw'
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

// Read Git smart-HTTP v0 advertisements: no Git executable, no API quota.
export function mainCommit(advertisement) {
  const bytes = Buffer.from(advertisement, 'utf8')
  let offset = 0
  while (offset < bytes.length) {
    const header = bytes.subarray(offset, offset + 4).toString('ascii')
    if (!/^[a-f0-9]{4}$/i.test(header)) throw new Error('Git 更新源响应格式无效')
    const length = parseInt(header, 16)
    if (length === 0) { offset += 4; continue }
    if (length < 4 || offset + length > bytes.length) throw new Error('Git 更新源响应不完整')
    const payload = bytes.subarray(offset + 4, offset + length).toString('utf8')
    const match = /^([a-f0-9]{40}) refs\/heads\/main(?:\0|\n|$)/.exec(payload)
    if (match) return match[1]
    offset += length
  }
  throw new Error('Git 更新源中没有 main 分支')
}

/** Return useful network diagnostics without echoing credentials or arbitrary server text. */
export function networkFailure(error, url) {
  const codes = new Set()
  const pending = [error]
  const seen = new Set()
  while (pending.length && seen.size < 20) {
    const item = pending.pop()
    if (!item || typeof item !== 'object' || seen.has(item)) continue
    seen.add(item)
    if (typeof item.code === 'string') codes.add(item.code)
    pending.push(item.cause, ...(Array.isArray(item.errors) ? item.errors : []))
  }
  const host = new URL(url).hostname
  let reason = '连接失败，请检查网络或代理'
  if (error?.name === 'TimeoutError' || codes.has('UND_ERR_CONNECT_TIMEOUT') || codes.has('ETIMEDOUT')) reason = '连接超时'
  else if (codes.has('ENOTFOUND') || codes.has('EAI_AGAIN')) reason = 'DNS 解析失败'
  else if (codes.has('ECONNREFUSED')) reason = '连接被拒绝，请检查代理是否运行'
  else if (codes.has('ECONNRESET') || codes.has('UND_ERR_SOCKET')) reason = '连接被重置或关闭'
  else if ([...codes].some(code => /CERT|TLS|SSL|VERIFY_LEAF/.test(code))) reason = 'HTTPS 证书或 TLS 校验失败'
  const code = [...codes].find(value => /^[A-Z][A-Z0-9_]{1,48}$/.test(value))
  return `${host}：${reason}${code ? `（${code}）` : ''}`
}

export class HospitalUpdater {
  constructor({ version, manager, fetcher = fetch, now = Date.now, signal, verifyInstalled, readRelease }) {
    this.manager = manager
    this.fetcher = fetcher
    this.now = now
    this.signal = signal
    this.verifyInstalled = verifyInstalled
    this.readRelease = readRelease
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
  async text(url) {
    const signal = this.signal ? AbortSignal.any([this.signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000)
    let response, text
    try {
      response = await this.fetcher(url, { signal, headers: { Accept: '*/*', 'User-Agent': PACKAGE } })
      text = await response.text()
    } catch (error) { throw new Error(networkFailure(error, url)) }
    if (!response.ok) {
      if (response.status === 403 || response.status === 429) throw new Error(`${new URL(url).hostname}：访问受限（HTTP ${response.status}），请稍后重试`)
      throw new Error(`${new URL(url).hostname}：无法访问（HTTP ${response.status}）`)
    }
    if (text.length > 256 * 1024) throw new Error('更新信息过大，已拒绝读取')
    return text
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
    this.state = { ...this.state, status: 'checking', message: '正在检查更新…' }
    try {
      let commit, manifest, viaGit = false
      try {
        const refs = await this.text(`${REPO_URL}/info/refs?service=git-upload-pack`)
        commit = mainCommit(refs)
        manifest = JSON.parse(await this.text(`${RAW_BASE}/${commit}/package.json`))
      } catch (httpError) {
        if (!this.readRelease || this.signal?.aborted) throw httpError
        this.state = { ...this.state, message: 'HTTP 检查未成功，正在通过 Git 安装源检查…' }
        try {
          const release = await this.readRelease()
          commit = release.commit
          manifest = release.manifest
          viaGit = true
          if (!SHA.test(commit)) throw new Error('Git 返回的提交编号无效')
        } catch (gitError) {
          throw new Error(`${httpError.message}；备用 Git 检查：${gitError.message}`)
        }
      }
      if (manifest.name !== PACKAGE || !manifest.dsh?.bundle) throw new Error('更新源不是医院插件')
      const newer = compareVersions(manifest.version, this.state.currentVersion) > 0
      this.state = { ...this.state, status: newer ? 'available' : 'current', checkedAt: this.now(),
        latestVersion: manifest.version, commit, canUpdate: this.supported(),
        message: (newer ? `发现新版本 ${manifest.version}` : '当前已是最新版本') + (viaGit ? '（通过 Git 安装源检查）' : '') }
    } catch (error) {
      this.state = { ...this.state, status: 'error', checkedAt: this.now(), commit: null, latestVersion: null,
        message: this.signal?.aborted ? '插件已停用' : `检查失败：${error.name === 'TimeoutError' ? '连接更新源超时' : error.message}` }
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
            const run = await manager.runPnpm(['add', `${REPO_URL}#${commit}`, '--ignore-scripts'], this.signal)
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
