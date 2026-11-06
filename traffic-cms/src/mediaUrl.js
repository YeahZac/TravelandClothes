/**
 * 素材路径约定（云托管公网不可靠时）：
 * - 入库：/uploads/qmyx/... 相对路径（或裸 qmyx/...）
 * - 小程序：callContainer → /api/traffic/v1/media/file?key=...&envelope=1
 * - 管理台预览：同域 /api/traffic/v1/media/file?key=...
 * - 禁止把列表改写成 *.tcloudbase.com / CDN 直链
 */
const cos = require('./cos')

function isHttp(url) {
  return /^https?:\/\//i.test(String(url || ''))
}

function stripUploadsPrefix(url) {
  let u = String(url || '').trim()
  if (u.startsWith('/cos/')) u = `/uploads/${u.slice(5)}`
  if (u.startsWith('/uploads/')) return u.slice('/uploads/'.length)
  if (u.startsWith('uploads/')) return u.slice('uploads/'.length)
  return u.replace(/^\/+/, '')
}

/** 从任意形态抽出 COS object key（qmyx/...） */
function extractKey(url) {
  const raw = String(url || '').trim()
  if (!raw || raw.startsWith('/static/') || raw.startsWith('static/')) return ''
  try {
    if (raw.includes('key=')) {
      const q = raw.includes('://') ? new URL(raw) : new URL(raw, 'http://local')
      const k = q.searchParams.get('key')
      if (k) return cos.normalizeKey(k)
    }
  } catch (_) {}
  if (raw.includes('/qmyx/')) {
    return cos.normalizeKey(raw.slice(raw.indexOf('/qmyx/') + 1))
  }
  if (raw.startsWith('qmyx/') || raw.startsWith('/uploads/') || raw.startsWith('/cos/')) {
    return cos.normalizeKey(raw)
  }
  if (isHttp(raw) && cos.CDN_HOST && raw.startsWith(cos.CDN_HOST)) {
    return cos.normalizeKey(raw.slice(cos.CDN_HOST.length))
  }
  return ''
}

/** 入库路径：永远相对 /uploads/qmyx/... */
function toStoragePath(url) {
  const raw = String(url || '').trim()
  if (!raw || raw.startsWith('/static/')) return ''
  const key = extractKey(raw)
  if (key) return `/uploads/${key}`
  if (raw.startsWith('/uploads/')) return raw
  return ''
}

/** 管理台 <img> 用：同域媒体代理（不要 CDN） */
function adminProxyUrl(url) {
  const key = extractKey(url) || (toStoragePath(url) ? stripUploadsPrefix(toStoragePath(url)) : '')
  if (!key) return ''
  return `/api/traffic/v1/media/file?key=${encodeURIComponent(key)}`
}

/** 给小程序 / catalog：保持可被解析的相对路径 */
function clientMediaPath(url) {
  return toStoragePath(url) || (String(url || '').startsWith('/static/') ? '' : String(url || '').trim())
}

/** @deprecated 名称保留：现改为返回相对路径，不再拼公网 */
function absolutizeMedia(url) {
  return clientMediaPath(url)
}

function normalizeStoredMedia(url) {
  return toStoragePath(url) || ''
}

module.exports = {
  isHttp,
  stripUploadsPrefix,
  extractKey,
  toStoragePath,
  adminProxyUrl,
  clientMediaPath,
  absolutizeMedia,
  normalizeStoredMedia,
}
