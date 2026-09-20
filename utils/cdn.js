const COS_BASE = 'https://7072-prod-d7gnz9s0j20275c05-1492159324.cos.ap-shanghai.myqcloud.com/mock'

function cdn(src) {
  if (!src) return src
  if (src.indexOf('http') === 0) return src
  const name = src.split('/').pop()
  return COS_BASE + '/' + name
}

function mapPhotos(list, fields) {
  const keys = fields || ['photo', 'cover', 'avatar', 'typePhoto']
  return (list || []).map((item) => {
    const next = Object.assign({}, item)
    keys.forEach((k) => {
      if (next[k]) next[k] = cdn(next[k])
    })
    if (Array.isArray(next.images)) next.images = next.images.map(cdn)
    return next
  })
}

module.exports = { cdn, mapPhotos, COS_BASE }
