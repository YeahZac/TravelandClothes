/**
 * 云托管媒体加载：callContainer 拉 /media/file?envelope=1 → 写本地 → <image src>
 * 禁止把 tcloudbase 公网 HTTPS 直链塞进 image。
 */
import { CLOUD_ENV_ID, CLOUD_SERVICE, CMS_BASE, request } from '../api/request.js'

const MEM = new Map()
const INFLIGHT = new Map()
const MEM_MAX = 80
const DIR = 'qmyx_media'

function extractKey(url) {
  const raw = String(url || '').trim()
  if (!raw || raw.startsWith('/static/')) return ''
  try {
    if (raw.includes('key=')) {
      const q = raw.includes('://') ? new URL(raw) : new URL(raw, 'https://local')
      const k = q.searchParams.get('key')
      if (k) return String(k).replace(/^\/+/, '').replace(/^uploads\//, '')
    }
  } catch (_) {}
  if (raw.includes('/qmyx/')) return raw.slice(raw.indexOf('qmyx/')).split('?')[0]
  if (raw.startsWith('/uploads/')) return raw.slice('/uploads/'.length).split('?')[0]
  if (raw.startsWith('qmyx/')) return raw.split('?')[0]
  return ''
}

function isBadPublicHost(url) {
  return /tcloudbase\.com|service\.tcloudbase\.com/i.test(String(url || ''))
}

function cachePathFor(key) {
  const safe = String(key).replace(/[^\w.\-/]+/g, '_').replace(/\//g, '__')
  // #ifdef MP-WEIXIN
  return `${wx.env.USER_DATA_PATH}/${DIR}/${safe}`
  // #endif
  // #ifndef MP-WEIXIN
  return ''
  // #endif
}

function ensureDir() {
  // #ifdef MP-WEIXIN
  try {
    const fs = wx.getFileSystemManager()
    const dir = `${wx.env.USER_DATA_PATH}/${DIR}`
    try {
      fs.accessSync(dir)
    } catch (_) {
      fs.mkdirSync(dir, true)
    }
  } catch (_) {}
  // #endif
}

function writeLocal(key, base64) {
  // #ifdef MP-WEIXIN
  ensureDir()
  const fs = wx.getFileSystemManager()
  const path = cachePathFor(key)
  fs.writeFileSync(path, base64, 'base64')
  return path
  // #endif
  // #ifndef MP-WEIXIN
  return ''
  // #endif
}

function readLocalIfExists(key) {
  // #ifdef MP-WEIXIN
  try {
    const fs = wx.getFileSystemManager()
    const path = cachePathFor(key)
    fs.accessSync(path)
    return path
  } catch (_) {
    return ''
  }
  // #endif
  return ''
}

function remember(key, path) {
  if (MEM.has(key)) MEM.delete(key)
  MEM.set(key, path)
  while (MEM.size > MEM_MAX) {
    const oldest = MEM.keys().next().value
    MEM.delete(oldest)
  }
}

/**
 * @param {string} src 配置里的 /uploads/qmyx/... 或代理 URL
 * @returns {Promise<string>} 本地文件路径或可用 src
 */
export async function ensureLocalImage(src) {
  const raw = String(src || '').trim()
  if (!raw) return ''
  if (raw.startsWith('/static/')) return raw
  if (raw.startsWith('wxfile://') || raw.startsWith('http://tmp') || raw.startsWith('file://')) return raw

  // 坏的公网兜底域名：强制改走 key 代理
  if (isBadPublicHost(raw)) {
    const k = extractKey(raw)
    if (!k) return ''
    return ensureLocalImage(`/uploads/${k}`)
  }

  const key = extractKey(raw)
  if (!key) {
    // 外部正常 https（非云托管坏域名）可直接用
    if (/^https?:\/\//i.test(raw)) return raw
    return ''
  }

  if (MEM.has(key)) return MEM.get(key)
  const existed = readLocalIfExists(key)
  if (existed) {
    remember(key, existed)
    return existed
  }

  if (INFLIGHT.has(key)) return INFLIGHT.get(key)

  const job = (async () => {
    try {
      const data = await request(
        `/api/traffic/v1/media/file?key=${encodeURIComponent(key)}&envelope=1`,
        { method: 'GET', timeout: 20000 }
      )
      if (!data || !data.base64) return ''
      const local = writeLocal(key, data.base64)
      if (local) {
        remember(key, local)
        return local
      }
    } catch (e) {
      console.warn('[cloudImage]', key, e && e.message)
    }

    // 非微信端：拼 CMS 代理（H5 调试）
    // #ifndef MP-WEIXIN
    return `${CMS_BASE}/api/traffic/v1/media/file?key=${encodeURIComponent(key)}`
    // #endif
    return ''
  })().finally(() => {
    INFLIGHT.delete(key)
  })

  INFLIGHT.set(key, job)
  return job
}

export function prefetchImages(urls = []) {
  const list = [...new Set((urls || []).filter(Boolean))].slice(0, 24)
  list.forEach((u) => {
    ensureLocalImage(u).catch(() => {})
  })
}

export { extractKey, CLOUD_ENV_ID, CLOUD_SERVICE }
