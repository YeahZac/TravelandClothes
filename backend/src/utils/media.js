const { getObjectUrl, localToCosKey, getSignedUrl } = require('../config/cos')

const COS_PUBLIC = process.env.COS_PUBLIC_BASE ||
  'https://7072-prod-d7gnz9s0j20275c05-1492159324.cos.ap-shanghai.myqcloud.com'

function publicUrl(src) {
  if (!src) return src
  if (String(src).indexOf('http') === 0) return src
  return getObjectUrl(localToCosKey(src))
}

async function resolveUrl(src) {
  if (!src) return src
  if (String(src).indexOf('http') === 0) return src
  const key = localToCosKey(src)
  if (process.env.COS_SIGN === '1') {
    try {
      return await getSignedUrl(key)
    } catch (e) {
      return getObjectUrl(key)
    }
  }
  return getObjectUrl(key)
}

async function mapRows(rows, fields) {
  const keys = fields || ['photo', 'cover', 'icon', 'image', 'avatar', 'hero']
  const list = rows || []
  const out = []
  for (const row of list) {
    const next = Object.assign({}, row)
    for (const k of keys) {
      if (next[k]) next[k] = await resolveUrl(next[k])
    }
    out.push(next)
  }
  return out
}

function yuan(fen) {
  const n = Number(fen || 0)
  return n % 100 === 0 ? String(n / 100) : (n / 100).toFixed(2)
}

function parseJson(value, fallback) {
  if (Array.isArray(value) || (value && typeof value === 'object')) return value
  try { return JSON.parse(value) } catch (e) { return fallback }
}

module.exports = { COS_PUBLIC, publicUrl, resolveUrl, mapRows, yuan, parseJson }
