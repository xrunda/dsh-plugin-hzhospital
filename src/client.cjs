// Browser factory body. React is supplied by the DSH module table.
const React = require('react')
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

exports.inject = ['slots']
exports.apply = function apply(ctx) {
  // Declaration-aware effects follow sidebar mount/unmount and plugin disable.
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.inject('sidebar.brand.name', function* () {
      yield ctx.slots.register({ name: 'sidebar.brand.mark' }, HospitalMark)
      yield ctx.slots.register({ name: 'sidebar.brand.name' }, HospitalName)
    }))
}
