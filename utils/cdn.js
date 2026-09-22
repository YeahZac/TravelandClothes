const { COS_BASE, CLOUD_FILE } = require('./config')

function cdn(src) {
  if (!src || typeof src !== 'string') return src
  if (src.indexOf('cloud://') === 0) return src
  const name = src.split('?')[0].split('/').pop()
  if (!/\.(jpe?g|png|webp|gif)$/i.test(name)) return src
  return CLOUD_FILE + '/' + name
}

function walk(value) {
  if (Array.isArray(value)) return value.map(walk)
  if (value && typeof value === 'object') {
    const next = {}
    Object.keys(value).forEach((k) => { next[k] = walk(value[k]) })
    return next
  }
  if (typeof value === 'string') return cdn(value)
  return value
}

function mapPhotos(list, fields) {
  const keys = fields || ['photo', 'cover', 'avatar', 'typePhoto', 'icon', 'hero', 'image']
  return (list || []).map((item) => {
    const next = Object.assign({}, item)
    keys.forEach((k) => {
      if (next[k]) next[k] = cdn(next[k])
    })
    if (Array.isArray(next.images)) next.images = next.images.map(cdn)
    return next
  })
}

module.exports = { cdn, walk, mapPhotos, COS_BASE, CLOUD_FILE }