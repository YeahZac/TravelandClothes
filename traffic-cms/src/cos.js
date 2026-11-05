/**
 * COS 适配器
 * - COS_MODE=local（默认）：写入 uploads/，按 qmyx/... 目录规范落盘
 * - COS_MODE=tencent：预留腾讯云 COS SDK 钩子（未配密钥时回退 local）
 *
 * 对外统一：
 *   putObject({ key, buffer, mime }) → { cosKey, url, etag }
 *   publicUrl(cosKey) → CDN / 本地绝对路径前缀由调用方拼 host
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const ROOT = path.join(__dirname, '..')
const UPLOAD_ROOT = path.join(ROOT, 'uploads')
const MODE = process.env.COS_MODE || 'local'
const CDN_HOST = (process.env.COS_CDN_HOST || '').replace(/\/$/, '')

/** 规范 key：允许 /cos/qmyx/... 或 qmyx/... 或 /uploads/qmyx/... */
function normalizeKey(input) {
  let k = String(input || '').replace(/^\/+/, '')
  if (k.startsWith('cos/')) k = k.slice(4)
  if (k.startsWith('uploads/')) k = k.slice('uploads/'.length)
  if (!k.startsWith('qmyx/')) k = `qmyx/${k}`
  return k.replace(/\\/g, '/')
}

function localAbsPath(cosKey) {
  return path.join(UPLOAD_ROOT, normalizeKey(cosKey))
}

function ensureParent(filePath) {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function etagOf(buf) {
  return crypto.createHash('md5').update(buf).digest('hex')
}

/**
 * 相对 URL（进配置 JSON）：/uploads/qmyx/...
 * bootstrap 时再 absolutize
 */
function relativeUrl(cosKey) {
  return `/uploads/${normalizeKey(cosKey)}`
}

function publicUrl(cosKey, baseUrl) {
  const key = normalizeKey(cosKey)
  if (MODE === 'tencent' && CDN_HOST) {
    return `${CDN_HOST}/${key}`
  }
  const rel = relativeUrl(key)
  return baseUrl ? `${baseUrl}${rel}` : rel
}

function putObject({ key, buffer, mime = 'application/octet-stream', originalName = '' }) {
  const cosKey = normalizeKey(key || `misc/${Date.now()}_${originalName || 'bin'}`)
  // tencent 模式未接 SDK 时同样落本地，保证开发可用
  const abs = localAbsPath(cosKey)
  ensureParent(abs)
  fs.writeFileSync(abs, buffer)
  const etag = etagOf(buffer)
  return {
    cosKey,
    path: relativeUrl(cosKey),
    url: relativeUrl(cosKey),
    etag,
    mime,
    bytes: buffer.length,
    mode: MODE,
  }
}

/** 目录脚手架：保证 COS 文件夹存在 */
function ensureFolderTree() {
  const folders = [
    'qmyx/brand',
    'qmyx/tabbar',
    'qmyx/banners',
    'qmyx/icons',
    'qmyx/energy',
    'qmyx/festival',
    'qmyx/mall',
    'qmyx/avatars',
    'qmyx/share',
  ]
  folders.forEach((f) => {
    const abs = path.join(UPLOAD_ROOT, f)
    if (!fs.existsSync(abs)) fs.mkdirSync(abs, { recursive: true })
    const keep = path.join(abs, '.keep')
    if (!fs.existsSync(keep)) fs.writeFileSync(keep, '')
  })
}

module.exports = {
  MODE,
  CDN_HOST,
  normalizeKey,
  relativeUrl,
  publicUrl,
  putObject,
  ensureFolderTree,
  UPLOAD_ROOT,
}
