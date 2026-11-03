/** React UI/controller; event-driven checks only, with no interval timer. */
function createUpdateStore(remote) {
  let state = { currentVersion: __HOSPITAL_VERSION__, status: 'idle', checkedAt: null,
    latestVersion: null, commit: null, message: '正在连接更新服务…', canUpdate: false }
  const listeners = new Set()
  let pending = null
  let disposed = false
  function publish(next) { if (!disposed) { state = next; for (const listener of listeners) listener() } }
  async function run(method, value) {
    if (pending) return pending
    publish({ ...state, status: method === 'update' ? 'installing' : 'checking', message: method === 'update' ? '正在安装更新，请勿退出 DSH…' : '正在检查更新…' })
    pending = (async () => {
      try {
        const result = await remote[method](value)
        if (!result.ok) throw new Error(result.error?.message || '更新服务不可用')
        publish(result.value)
      } catch (error) { publish({ ...state, status: 'error', message: error.message }) }
    })().finally(() => { pending = null })
    return pending
  }
  return {
    getSnapshot: () => state,
    unavailable(message) { publish({ ...state, status: 'error', canUpdate: false, message }) },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    check(force) {
      if (!force && state.checkedAt !== null && Date.now() - state.checkedAt < 15 * 60 * 1000) return Promise.resolve()
      return run('check', force)
    },
    update: () => run('update', state.commit),
    dispose() { disposed = true; listeners.clear() },
  }
}

function makeUpdatePanel(React, store) {
  const h = React.createElement
  const buttonStyle = { font: 'inherit', padding: '7px 14px', borderRadius: 8, border: '1px solid currentColor', color: 'inherit', background: 'transparent', cursor: 'pointer' }
  return function UpdatePanel() {
    const state = React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
    // Host-side freshness and shared in-flight checks prevent duplicate requests.
    React.useEffect(() => { void store.check(false) }, [])
    const busy = state.status === 'checking' || state.status === 'installing'
    return h('section', { 'aria-label': '插件版本更新', style: { margin: '20px 0', padding: 20, border: '1px solid rgba(128,128,128,.3)', borderRadius: 12 } },
      h('h3', { style: { margin: '0 0 12px', fontSize: 16 } }, '版本更新'),
      h('div', { style: { display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 14 } },
        h('span', null, `当前运行版本：${state.currentVersion}`),
        state.latestVersion ? h('span', null, `源仓库版本：${state.latestVersion}`) : null),
      h('p', { role: state.status === 'error' ? 'alert' : 'status', 'aria-live': 'polite', style: { margin: '12px 0', fontSize: 14 } }, state.message),
      h('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap' } },
        h('button', { type: 'button', style: buttonStyle, disabled: busy || state.status === 'restart-required', onClick: () => { void store.check(true) } }, busy ? (state.status === 'installing' ? '更新中…' : '检查中…') : '检查更新'),
        state.status === 'available' && state.canUpdate ? h('button', { type: 'button', style: { ...buttonStyle, background: '#0d8264', color: '#fff', borderColor: '#0d8264' }, onClick: () => { void store.update() } }, `更新到 ${state.latestVersion}`) : null,
        state.commit ? h('a', { href: `https://git.xrunda.com/mdt/dsh-plugin-hzhospital/-/commit/${state.commit}`, target: '_blank', rel: 'noreferrer', style: { color: 'inherit', alignSelf: 'center', fontSize: 13 } }, '查看更新提交') : null),
      state.status === 'available' && !state.canUpdate ? h('p', { style: { fontSize: 13 } }, '当前 DSH 版本的安装接口不兼容，请使用 DSH 添加插件入口更新。') : null,
      state.checkedAt ? h('p', { style: { fontSize: 12, opacity: .65, marginBottom: 0 } }, `上次检查：${new Date(state.checkedAt).toLocaleString()}`) : null)
  }
}
