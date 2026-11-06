/**
 * COS 适配器
 * - COS_MODE=local：写入 uploads/qmyx/...
 * - COS_MODE=tencent：上传腾讯云 COS（前缀 qmyx/）
 *   凭证优先：云托管工作负载 TENCENTCLOUD_* → COS_* → QCLOUD_*
 *   COS 失败时回落 media_blob（CynosDB），保证管理台/小程序仍可预览
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const https = require('https')
const http = require('http')

const ROOT = path.join(__dirname, '..')
const UPLOAD_ROOT = path.join(ROOT, 'uploads')
const MODE = process.env.COS_MODE || 'local'
const CDN_HOST = (process.env.COS_CDN_HOST || process.env.COS_PUBLIC_BASE || '').replace(/\/$/, '')
const COS_BUCKET = process.env.COS_BUCKET || ''
const COS_REGION = resolveRegion()

let CosSdk = null
try {
  CosSdk = require('cos-nodejs-sdk-v5')
} catch (_) {
  CosSdk = null
}

let mediaBlobService = null
function blob() {
  if (!mediaBlobService) mediaBlobService = require('./services/mediaBlobService')
  return mediaBlobService
}

function resolveRegion() {
  if (process.env.COS_REGION) return process.env.COS_REGION
  // 云开发默认桶 7072-prod-... 多在上海
  const bucket = process.env.COS_BUCKET || ''
  if (/^7072-/.test(bucket)) return 'ap-shanghai'
  return 'ap-guangzhou'
}

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

function relativeUrl(cosKey) {
  return `/uploads/${normalizeKey(cosKey)}`
}

function publicUrl(cosKey, baseUrl) {
  const key = normalizeKey(cosKey)
  if (MODE === 'tencent') {
    if (CDN_HOST) return `${CDN_HOST}/${key}`
    if (COS_BUCKET && COS_REGION) {
      return `https://${COS_BUCKET}.cos.${COS_REGION}.myqcloud.com/${key}`
    }
  }
  const rel = relativeUrl(key)
  return baseUrl ? `${baseUrl}${rel}` : rel
}

function readCreds() {
  // 云托管开启「云调用 / 默认角色」时注入临时密钥
  const SecretId =
    process.env.TENCENTCLOUD_SECRETID ||
    process.env.COS_SECRET_ID ||
    process.env.QCLOUD_SECRET_ID ||
    ''
  const SecretKey =
    process.env.TENCENTCLOUD_SECRETKEY ||
    process.env.COS_SECRET_KEY ||
    process.env.QCLOUD_SECRET_KEY ||
    ''
  const SecurityToken =
    process.env.TENCENTCLOUD_SESSIONTOKEN ||
    process.env.COS_TOKEN ||
    process.env.QCLOUD_TOKEN ||
    ''
  return { SecretId, SecretKey, SecurityToken }
}

function cosDiag() {
  const c = readCreds()
  return {
    mode: MODE,
    bucket: COS_BUCKET || '',
    region: COS_REGION || '',
    cdnHost: CDN_HOST || '',
    hasSecretId: !!c.SecretId,
    hasSecretKey: !!c.SecretKey,
    hasSessionToken: !!c.SecurityToken,
    credSource: c.SecretId
      ? process.env.TENCENTCLOUD_SECRETID
        ? 'TENCENTCLOUD'
        : process.env.COS_SECRET_ID
          ? 'COS_SECRET'
          : 'QCLOUD'
      : 'none',
  }
}

function createClient() {
  if (!CosSdk) throw new Error('未安装 cos-nodejs-sdk-v5')
  const { SecretId, SecretKey, SecurityToken } = readCreds()
  if (!SecretId || !SecretKey) {
    throw new Error(
      '缺少 COS 密钥：请配置云托管环境变量 COS_SECRET_ID/KEY，或开启默认角色注入 TENCENTCLOUD_SECRETID/KEY'
    )
  }
  if (!COS_BUCKET) throw new Error('缺少 COS_BUCKET')
  return new CosSdk({
    SecretId,
    SecretKey,
    SecurityToken: SecurityToken || undefined,
  })
}

function putLocal({ cosKey, buffer, mime }) {
  const abs = localAbsPath(cosKey)
  ensureParent(abs)
  fs.writeFileSync(abs, buffer)
  try {
    blob().putBlob({ cosKey, buffer, mime })
  } catch (_) {}
  return {
    cosKey,
    path: relativeUrl(cosKey),
    url: relativeUrl(cosKey),
    etag: etagOf(buffer),
    mime,
    bytes: buffer.length,
    mode: 'local',
  }
}

function putTencentSdk({ cosKey, buffer, mime }) {
  const cos = createClient()
  return new Promise((resolve, reject) => {
    const payload = {
      Bucket: COS_BUCKET,
      Region: COS_REGION,
      Key: cosKey,
      Body: buffer,
      ContentType: mime || 'application/octet-stream',
    }
    const finish = (data) => {
      const rel = relativeUrl(cosKey)
      resolve({
        cosKey,
        path: rel,
        url: rel,
        etag: (data && data.ETag) || etagOf(buffer),
        mime,
        bytes: buffer.length,
        mode: 'tencent',
      })
    }
    cos.putObject({ ...payload, Headers: { 'x-cos-acl': 'public-read' } }, (err, data) => {
      if (!err) return finish(data)
      cos.putObject(payload, (err2, data2) => {
        if (err2) return reject(err2)
        finish(data2)
      })
    })
  })
}

function httpGetBuffer(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http
    const req = lib.get(url, { timeout: 15000 }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        return httpGetBuffer(res.headers.location).then(resolve, reject)
      }
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error(`HTTP ${res.statusCode}`))
      }
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const buffer = Buffer.concat(chunks)
        resolve({
          buffer,
          mime: res.headers['content-type'] || 'application/octet-stream',
        })
      })
    })
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('HTTP timeout'))
    })
  })
}

/**
 * @returns {object|Promise<object>}
 */
async function putObject({ key, buffer, mime = 'application/octet-stream', originalName = '' }) {
  const cosKey = normalizeKey(key || `misc/${Date.now()}_${originalName || 'bin'}`)
  if (MODE !== 'tencent') {
    return putLocal({ cosKey, buffer, mime })
  }
  try {
    const put = await putTencentSdk({ cosKey, buffer, mime })
    try {
      blob().putBlob({ cosKey, buffer, mime })
    } catch (_) {}
    return put
  } catch (e) {
    const msg = (e && (e.message || e.error || e.Code)) || 'COS 上传失败'
    console.warn('[cos] putObject fail, fallback media_blob:', msg)
    try {
      const saved = blob().putBlob({ cosKey, buffer, mime })
      return {
        cosKey,
        path: relativeUrl(cosKey),
        url: relativeUrl(cosKey),
        etag: saved.etag,
        mime,
        bytes: buffer.length,
        mode: 'db-fallback',
        warning: `COS 不可用（${msg}），已写入数据库回落存储`,
      }
    } catch (e2) {
      const err = new Error(
        `COS 上传失败：${msg}；数据库回落亦失败：${e2.message}。请检查 COS_BUCKET/REGION/密钥权限或云托管默认角色`
      )
      err.cause = e
      throw err
    }
  }
}

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

async function getObject(key) {
  const cosKey = normalizeKey(key)

  // 1) DB 回落（最快且不依赖 COS 权限）
  try {
    const fromDb = blob().getBlob(cosKey)
    if (fromDb) return fromDb
  } catch (_) {}

  // 2) 本地盘
  if (MODE !== 'tencent') {
    const abs = localAbsPath(cosKey)
    if (fs.existsSync(abs)) {
      const buffer = fs.readFileSync(abs)
      const ext = path.extname(abs).toLowerCase()
      const mime =
        ext === '.png'
          ? 'image/png'
          : ext === '.webp'
            ? 'image/webp'
            : ext === '.gif'
              ? 'image/gif'
              : 'image/jpeg'
      return { cosKey, buffer, mime, bytes: buffer.length, etag: etagOf(buffer), mode: 'local' }
    }
  } else {
    const abs = localAbsPath(cosKey)
    if (fs.existsSync(abs)) {
      const buffer = fs.readFileSync(abs)
      return {
        cosKey,
        buffer,
        mime: 'application/octet-stream',
        bytes: buffer.length,
        etag: etagOf(buffer),
        mode: 'local-cache',
      }
    }
  }

  // 3) COS SDK
  if (MODE === 'tencent') {
    try {
      const cos = createClient()
      const data = await new Promise((resolve, reject) => {
        cos.getObject(
          {
            Bucket: COS_BUCKET,
            Region: COS_REGION,
            Key: cosKey,
          },
          (err, body) => {
            if (err) return reject(err)
            resolve(body)
          }
        )
      })
      const buffer = Buffer.isBuffer(data.Body) ? data.Body : Buffer.from(data.Body || '')
      const out = {
        cosKey,
        buffer,
        mime:
          (data.headers && (data.headers['content-type'] || data.headers['Content-Type'])) ||
          'application/octet-stream',
        bytes: buffer.length,
        etag: (data.ETag || '').replace(/"/g, '') || etagOf(buffer),
        mode: 'tencent',
      }
      try {
        blob().putBlob({ cosKey, buffer, mime: out.mime })
      } catch (_) {}
      return out
    } catch (e) {
      console.warn('[cos] getObject sdk fail:', e && e.message)
    }

    // 4) CDN / 公网直链兜底
    const candidates = []
    if (CDN_HOST) candidates.push(`${CDN_HOST}/${cosKey}`)
    if (COS_BUCKET && COS_REGION) {
      candidates.push(`https://${COS_BUCKET}.cos.${COS_REGION}.myqcloud.com/${cosKey}`)
    }
    for (const url of candidates) {
      try {
        const got = await httpGetBuffer(url)
        try {
          blob().putBlob({ cosKey, buffer: got.buffer, mime: got.mime })
        } catch (_) {}
        return {
          cosKey,
          buffer: got.buffer,
          mime: got.mime,
          bytes: got.buffer.length,
          etag: etagOf(got.buffer),
          mode: 'cdn',
        }
      } catch (_) {}
    }
  }

  const err = new Error(
    MODE === 'tencent'
      ? `媒体不存在或 COS 无权读取（key=${cosKey}）。请重新上传，或检查云托管 COS 密钥/默认角色权限`
      : '文件不存在'
  )
  err.code = 'ENOENT'
  err.status = 404
  throw err
}

module.exports = {
  MODE,
  CDN_HOST,
  COS_BUCKET,
  COS_REGION,
  normalizeKey,
  relativeUrl,
  publicUrl,
  putObject,
  getObject,
  ensureFolderTree,
  UPLOAD_ROOT,
  cosDiag,
  readCreds,
}
