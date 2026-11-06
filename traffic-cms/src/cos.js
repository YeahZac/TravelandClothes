/**
 * COS 适配器
 * - COS_MODE=local：写入 uploads/qmyx/...
 * - COS_MODE=tencent：上传腾讯云 COS（前缀 qmyx/，不覆盖其它业务前缀）
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const ROOT = path.join(__dirname, '..')
const UPLOAD_ROOT = path.join(ROOT, 'uploads')
const MODE = process.env.COS_MODE || 'local'
const CDN_HOST = (process.env.COS_CDN_HOST || process.env.COS_PUBLIC_BASE || '').replace(/\/$/, '')
const COS_BUCKET = process.env.COS_BUCKET || ''
const COS_REGION = process.env.COS_REGION || 'ap-guangzhou'

let CosSdk = null
try {
  CosSdk = require('cos-nodejs-sdk-v5')
} catch (_) {
  CosSdk = null
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

function createClient() {
  if (!CosSdk) throw new Error('未安装 cos-nodejs-sdk-v5')
  const SecretId = process.env.COS_SECRET_ID || process.env.QCLOUD_SECRET_ID
  const SecretKey = process.env.COS_SECRET_KEY || process.env.QCLOUD_SECRET_KEY
  const SecurityToken = process.env.COS_TOKEN || process.env.QCLOUD_TOKEN
  if (!SecretId || !SecretKey) throw new Error('缺少 COS_SECRET_ID / COS_SECRET_KEY')
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

function putTencent({ cosKey, buffer, mime }) {
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
      const url = publicUrl(cosKey)
      resolve({
        cosKey,
        path: url,
        url,
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

/**
 * @returns {object|Promise<object>}
 * COS_MODE=tencent 时缺密钥直接失败，禁止静默写本地（云托管本地盘临时且小程序无法加载相对路径）
 */
function putObject({ key, buffer, mime = 'application/octet-stream', originalName = '' }) {
  const cosKey = normalizeKey(key || `misc/${Date.now()}_${originalName || 'bin'}`)
  if (MODE === 'tencent') {
    return putTencent({ cosKey, buffer, mime })
  }
  return putLocal({ cosKey, buffer, mime })
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

module.exports = {
  MODE,
  CDN_HOST,
  COS_BUCKET,
  COS_REGION,
  normalizeKey,
  relativeUrl,
  publicUrl,
  putObject,
  ensureFolderTree,
  UPLOAD_ROOT,
}
