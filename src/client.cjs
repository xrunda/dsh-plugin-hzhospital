// Browser factory body. React is supplied by the DSH module table.
const React = require('react')
const { z } = require('zod')
__HOSPITAL_REMOTE_WIRE__
__HOSPITAL_UPDATE_UI__
const logo = __HOSPITAL_LOGO_DATA_URI__
const aspect = 4140 / 640
const emblemFraction = 640 / 4140
const hospitalName = '菏泽市中医医院'

function image(height) {
  return React.createElement('img', {
    src: logo,
    alt: hospitalName,
    draggable: false,
    width: height * aspect,
    height,
    style: { display: 'block', width: height * aspect, height, maxWidth: 'none', flexShrink: 0 },
  })
}

// Crop in CSS only: preserve the original PNG bytes and its proportions.
function HospitalMark({ size = 24 }) {
  return React.createElement('span', {
    title: hospitalName,
    style: { display: 'inline-flex', width: size, height: size, overflow: 'hidden', flexShrink: 0 },
  }, image(size))
}

function HospitalName() {
  const height = 24
  return React.createElement('span', {
    title: hospitalName,
    style: { display: 'inline-flex', width: height * aspect * (1 - emblemFraction), height, overflow: 'hidden', maxWidth: '100%' },
  }, React.createElement('span', {
    style: { display: 'block', marginLeft: -height, flexShrink: 0 },
  }, image(height)))
}

// The empty-conversation hero hardcodes its headline as the i18n string
// `hero.headline`; only the mark has a slot. Taking the mark and hiding the
// neighbouring text is therefore the whole replacement. The headline row is a
// three-column grid (mark, text, preview badge); collapsing it to two columns
// lets the hospital name use the mark's column without moving the badge.
// Selectors match the CSS-module suffix so a build-time hash change does not
// silently leave the official headline visible.
const heroCss = [
  // `_headline` alone also names unrelated rows elsewhere, so require the hero's
  // own mark host before changing the grid.
  '[class$="_headline"]:has(> [class$="_fishHitbox"]){grid-template-columns:auto auto!important}',
  '[class$="_headlineText"]{display:none!important}',
  '[class$="_fishHitbox"]{white-space:nowrap}',
].join('')

function installHeroStyle() {
  if (typeof document === 'undefined') return () => {}
  const selector = 'style[data-plugin="dsh-plugin-hzhospital"][data-hero]'
  let tag = document.querySelector(selector)
  const owned = tag === null
  if (owned) {
    tag = document.createElement('style')
    tag.dataset.plugin = 'dsh-plugin-hzhospital'
    tag.dataset.hero = ''
    tag.textContent = heroCss
    document.head.appendChild(tag)
  }
  return () => { if (owned) tag.remove() }
}

function HeroHeadline() {
  return React.createElement('span', {
    title: hospitalName,
    style: { whiteSpace: 'nowrap' },
  }, hospitalName)
}

exports.inject = ['slots', 'remote']
exports.apply = function apply(ctx) {
  let updateApi
  const store = createUpdateStore({
    check: force => { if (!updateApi) throw new Error('更新服务尚未连接，请稍后重试'); return updateApi.check(force) },
    update: commit => { if (!updateApi) throw new Error('更新服务尚未连接，请稍后重试'); return updateApi.update(commit) },
  })
  const UpdatePanel = makeUpdatePanel(React, store)
  function BrandNameWithNotice() {
    const state = React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
    return React.createElement('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } },
      React.createElement(HospitalName),
      state.status === 'available' ? React.createElement('span', { title: `医院插件 ${state.latestVersion} 可更新，请打开医院插件详情页`, 'aria-label': '医院插件有新版本', style: { width: 7, height: 7, borderRadius: '50%', background: '#20b985', flexShrink: 0 } }) : null)
  }
  ctx.effect(() => () => store.dispose(), 'hzhospital: update UI lifetime')
  // A startup connection may become ready after the plugin is materialized.
  ctx.on('connection/reset', () => { if (updateApi) void store.check(false) })
  ctx.effect(async () => {
    try {
      const dispose = await ctx.remote.$mount(updateContribution(z))
      // Cordis requires an explicit injection for each mounted Remote namespace.
      ctx.inject(['remote.hzhospitalUpdates'], updateCtx => {
        updateApi = updateCtx.remote.hzhospitalUpdates
        void store.check(false)
        return () => { updateApi = undefined }
      })
      return dispose
    } catch (error) {
      // Keep the branding alive when an older DSH cannot mount the updater.
      store.unavailable('当前 DSH 无法连接插件更新服务：' + error.message)
      console.warn('[hzhospital] update service unavailable', error)
    }
  }, 'hzhospital: mount update API and check on load')
  ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register(
    { name: 'plugins.bundle.config', key: 'dsh-plugin-hzhospital' }, UpdatePanel))
  // Declaration-aware effects follow sidebar mount/unmount and plugin disable.
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.inject('sidebar.brand.name', function* () {
      yield ctx.slots.register({ name: 'sidebar.brand.mark' }, HospitalMark)
      yield ctx.slots.register({ name: 'sidebar.brand.name' }, BrandNameWithNotice)
    }))
  // The hero sits outside the sidebar, so its replacement stands on its own:
  // without the style tag the official headline would sit next to our mark.
  ctx.slots.inject('conversation.hero.brand.mark', () => {
    const disposeStyle = installHeroStyle()
    const disposeSlot = ctx.slots.register({ name: 'conversation.hero.brand.mark' }, HeroHeadline)
    return () => { disposeSlot(); disposeStyle() }
  })
}
