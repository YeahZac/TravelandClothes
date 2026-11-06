/**
 * 素材 URL 规范化：相对路径 → 可公网访问的绝对地址
 * - https:// 原样
 * - /uploads/qmyx/... → COS_PUBLIC_BASE/qmyx/... 或 {origin}/uploads/...
 * - /static/... 视为小程序包内占位，后台展示时置空（避免裂图）
 */
const cos = require('./cos')

function isHttp(url) {
  return /^https?:\/\//i.test(String(url || ''))
}

function stripUploadsPrefix(url) {
  let u = String(url || '').trim()
  if (u.startsWith('/cos/')) u = `/uploads/${u.slice(5)}`
  if (u.startsWith('/uploads/')) return u.slice('/uploads/'.length)
  return u.replace(/^\/+/, '')
}

/** 管理台 / catalog 展示用 */
function absolutizeMedia(url, reqBaseUrl) {
  const raw = String(url || '').trim()
  if (!raw) return ''
  if (isHttp(raw) || raw.startsWith('data:')) return raw
  // 小程序本地包路径：浏览器后台打不开
  if (raw.startsWith('/static/')) return ''
  if (raw.startsWith('/uploads/') || raw.startsWith('/cos/') || raw.startsWith('qmyx/')) {
    const key = stripUploadsPrefix(raw.startsWith('qmyx/') ? `/uploads/${raw}` : raw)
    if (cos.CDN_HOST) return `${cos.CDN_HOST.replace(/\/$/, '')}/${key}`
    if (cos.MODE === 'tencent' && cos.COS_BUCKET && cos.COS_REGION) {
      return `https://${cos.COS_BUCKET}.cos.${cos.COS_REGION}.myqcloud.com/${key}`
    }
    const base = String(reqBaseUrl || '').replace(/\/$/, '')
    return `${base}/uploads/${key}`
  }
  return raw
}

/** 入库前尽量存可跨端使用的地址（优先 CDN 绝对 URL） */
function normalizeStoredMedia(url, reqBaseUrl) {
  const abs = absolutizeMedia(url, reqBaseUrl)
  return abs || String(url || '').trim()
}

module.exports = {
  absolutizeMedia,
  normalizeStoredMedia,
  stripUploadsPrefix,
  isHttp,
}
