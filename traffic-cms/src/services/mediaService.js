/**
 * 媒体代理：从 COS/本地读文件，内存缓存，供小程序 callContainer 与管理台预览。
 */
const cos = require('../cos')
const mediaUrl = require('../mediaUrl')

const CACHE_MAX = Number(process.env.MEDIA_CACHE_MAX || 80)
const CACHE_TTL_MS = Number(process.env.MEDIA_CACHE_TTL_MS || 10 * 60 * 1000)
const cache = new Map()

function touch(key, entry) {
  cache.delete(key)
  cache.set(key, entry)
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value
    cache.delete(oldest)
  }
}

async function getFile(rawKey) {
  const key = mediaUrl.extractKey(rawKey) || cos.normalizeKey(rawKey || '')
  if (!key || !key.startsWith('qmyx/')) {
    const err = new Error('非法媒体 key')
    err.status = 400
    throw err
  }
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    touch(key, hit)
    return { ...hit, key, cached: true }
  }
  const obj = await cos.getObject(key)
  const entry = {
    at: Date.now(),
    buffer: obj.buffer,
    mime: obj.mime || 'application/octet-stream',
    etag: obj.etag || '',
    bytes: obj.bytes || (obj.buffer && obj.buffer.length) || 0,
  }
  touch(key, entry)
  return { ...entry, key, cached: false }
}

function warmKeysAsync(keys = []) {
  const list = [...new Set((keys || []).map((k) => mediaUrl.extractKey(k) || '').filter(Boolean))].slice(0, 40)
  if (!list.length) return
  setImmediate(() => {
    list.forEach((key) => {
      getFile(key).catch(() => {})
    })
  })
}

function collectKeysFromValue(v, out = []) {
  if (!v) return out
  if (typeof v === 'string') {
    const k = mediaUrl.extractKey(v)
    if (k) out.push(k)
    return out
  }
  if (Array.isArray(v)) {
    v.forEach((i) => collectKeysFromValue(i, out))
    return out
  }
  if (typeof v === 'object') {
    Object.keys(v).forEach((k) => collectKeysFromValue(v[k], out))
  }
  return out
}

module.exports = {
  getFile,
  warmKeysAsync,
  collectKeysFromValue,
}
