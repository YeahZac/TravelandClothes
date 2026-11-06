/**
 * COS 适配器
 * - COS_MODE=local：写入 uploads/qmyx/...
 * - COS_MODE=tencent：上传腾讯云 / 微信云托管对象存储（前缀 qmyx/）
 *   凭证优先：容器内开放接口 /_/cos/getauth → TENCENTCLOUD_* → COS_* → QCLOUD_*
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
/** 云托管内默认走 getauth；本地可 COS_USE_WX_GETAUTH=0 关掉 */
const USE_WX_GETAUTH = String(process.env.COS_USE_WX_GETAUTH || (MODE === 'tencent' ? '1' : '0')) !== '0'
const WX_OPEN_API_HOST = process.env.WX_OPEN_API_HOST || 'http://api.weixin.qq.com'

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

function readEnvCreds() {
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
  const source = SecretId
    ? process.env.TENCENTCLOUD_SECRETID
      ? 'TENCENTCLOUD'
      : process.env.COS_SECRET_ID
        ? 'COS_SECRET'
        : 'QCLOUD'
    : 'none'
  return { SecretId, SecretKey, SecurityToken, source }
}

/** @deprecated 兼容旧调用：仅环境变量 */
function readCreds() {
  const c = readEnvCreds()
  return { SecretId: c.SecretId, SecretKey: c.SecretKey, SecurityToken: c.SecurityToken }
}

let authCache = null
let lastCredSource = 'none'
let lastGetauthError = ''
let lastOpenapiSeqid = ''
let lastRemoteAddress = ''

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * 容器内必须走 HTTP + 开放接口旁路；勿用 HTTPS（除非配了 NODE_EXTRA_CA_CERTS）。
 * family:4 避免偶发 IPv6 导致 hang up。
 */
function httpJson(url, { method = 'GET', body = null, timeoutMs = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const lib = u.protocol === 'https:' ? https : http
    const payload = body == null ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))
    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: `${u.pathname}${u.search}`,
        method,
        timeout: timeoutMs,
        family: 4,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': payload.length } : {}),
        },
      },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          const seq = res.headers['x-openapi-seqid'] || res.headers['X-Openapi-Seqid'] || ''
          if (seq) lastOpenapiSeqid = String(seq)
          if (res.socket && res.socket.remoteAddress) {
            lastRemoteAddress = String(res.socket.remoteAddress)
          }
          if (res.statusCode && res.statusCode >= 400) {
            return reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 200)}`))
          }
          try {
            resolve({ json: text ? JSON.parse(text) : {}, statusCode: res.statusCode || 200 })
          } catch (e) {
            reject(new Error(`JSON 解析失败: ${text.slice(0, 200)}`))
          }
        })
      }
    )
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('开放接口超时'))
    })
    if (payload) req.write(payload)
    req.end()
  })
}

async function fetchWxGetauthOnce() {
  const { json: info } = await httpJson(`${WX_OPEN_API_HOST}/_/cos/getauth`, {
    method: 'GET',
    timeoutMs: 8000,
  })
  if (!info || !info.TmpSecretId || !info.TmpSecretKey) {
    throw new Error(`getauth 无效响应: ${JSON.stringify(info).slice(0, 200)}`)
  }
  const expired = Number(info.ExpiredTime || 0)
  return {
    TmpSecretId: info.TmpSecretId,
    TmpSecretKey: info.TmpSecretKey,
    SecurityToken: info.Token || '',
    ExpiredTime: expired,
  }
}

/** 启动初期开放接口旁路未就绪时常见 socket hang up，需退避重试 */
async function fetchWxGetauth({ retries = 4 } = {}) {
  let lastErr
  for (let i = 0; i < retries; i++) {
    try {
      return await fetchWxGetauthOnce()
    } catch (e) {
      lastErr = e
      const msg = (e && e.message) || String(e)
      const retryable = /socket hang up|ECONNRESET|ECONNREFUSED|ETIMEDOUT|超时|ENOTFOUND/i.test(msg)
      if (!retryable || i === retries - 1) break
      await sleep(1500 * (i + 1))
    }
  }
  throw lastErr
}

async function resolveAuthForSdk() {
  if (USE_WX_GETAUTH) {
    const now = Math.floor(Date.now() / 1000)
    if (authCache && authCache.ExpiredTime > now + 60) {
      lastCredSource = 'WX_GETAUTH'
      return authCache
    }
    try {
      authCache = await fetchWxGetauth({ retries: 4 })
      lastCredSource = 'WX_GETAUTH'
      lastGetauthError = ''
      return authCache
    } catch (e) {
      lastGetauthError = (e && e.message) || String(e)
      console.warn('[cos] wx getauth fail, fallback env:', lastGetauthError)
    }
  }
  const env = readEnvCreds()
  if (!env.SecretId || !env.SecretKey) {
    throw new Error(
      '缺少 COS 凭证：请确认本服务版本是在「开放接口服务」开启后构建；或稍后重试 / 配置 COS_SECRET 兜底'
    )
  }
  lastCredSource = env.source
  return {
    TmpSecretId: env.SecretId,
    TmpSecretKey: env.SecretKey,
    SecurityToken: env.SecurityToken || '',
    ExpiredTime: Math.floor(Date.now() / 1000) + 3600,
  }
}

function cosDiag() {
  const env = readEnvCreds()
  return {
    mode: MODE,
    bucket: COS_BUCKET || '',
    region: COS_REGION || '',
    cdnHost: CDN_HOST || '',
    useWxGetauth: USE_WX_GETAUTH,
    hasSecretId: !!(authCache && authCache.TmpSecretId) || !!env.SecretId,
    hasSecretKey: !!(authCache && authCache.TmpSecretKey) || !!env.SecretKey,
    hasSessionToken: !!(authCache && authCache.SecurityToken) || !!env.SecurityToken,
    credSource: lastCredSource !== 'none' ? lastCredSource : env.source,
    envCredSource: env.source,
    lastGetauthError: lastGetauthError || '',
    openapiSeqid: lastOpenapiSeqid || '',
    remoteAddress: lastRemoteAddress || '',
  }
}

/** 主动探测（勿在进程刚启动的瞬间依赖结果） */
async function probeWxGetauth() {
  const started = Date.now()
  try {
    authCache = await fetchWxGetauth({ retries: 5 })
    lastCredSource = 'WX_GETAUTH'
    lastGetauthError = ''
    return {
      ok: true,
      ms: Date.now() - started,
      ...cosDiag(),
      tip: lastOpenapiSeqid
        ? '已走开放接口链路（含 x-openapi-seqid）'
        : '已拿到临时密钥；若无 seqid，请确认本版本在开启开放接口后构建',
    }
  } catch (e) {
    lastGetauthError = (e && e.message) || String(e)
    return {
      ok: false,
      ms: Date.now() - started,
      ...cosDiag(),
      tip:
        'getauth 失败。请确认：①开放接口已开 ②令牌含 /_/cos/getauth ③当前流量版本是开启后新建 ④发布后等 1～2 分钟再探',
    }
  }
}

async function encodeMetaFileId(cosKey) {
  if (!USE_WX_GETAUTH || !COS_BUCKET) return ''
  const objectPath = `/${normalizeKey(cosKey)}`
  try {
    const { json: info } = await httpJson(`${WX_OPEN_API_HOST}/_/cos/metaid/encode`, {
      method: 'POST',
      body: {
        openid: '',
        bucket: COS_BUCKET,
        paths: [objectPath],
      },
      timeoutMs: 8000,
    })
    const list = info && info.respdata && info.respdata.x_cos_meta_field_strs
    if (Array.isArray(list) && list[0]) return String(list[0])
    if (info && info.errcode) {
      console.warn('[cos] metaid encode errcode=', info.errcode, info.errmsg || '')
    }
  } catch (e) {
    console.warn('[cos] metaid encode fail:', e && e.message)
  }
  return ''
}

function createClient() {
  if (!CosSdk) throw new Error('未安装 cos-nodejs-sdk-v5')
  if (!COS_BUCKET) throw new Error('缺少 COS_BUCKET')
  return new CosSdk({
    getAuthorization: function (_options, callback) {
      resolveAuthForSdk()
        .then((auth) => {
          callback({
            TmpSecretId: auth.TmpSecretId,
            TmpSecretKey: auth.TmpSecretKey,
            SecurityToken: auth.SecurityToken || undefined,
            ExpiredTime: auth.ExpiredTime,
          })
        })
        .catch((err) => {
          callback(err)
        })
    },
  })
}

async function putLocal({ cosKey, buffer, mime }) {
  const abs = localAbsPath(cosKey)
  ensureParent(abs)
  fs.writeFileSync(abs, buffer)
  try {
    await blob().putBlobAsync({ cosKey, buffer, mime })
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

let cosSkipUntil = 0

function cosErrorText(err) {
  return String((err && (err.message || err.error || err.Code || err.code)) || err || '')
}

function isCosDenied(err) {
  return /Access Denied|AccessDenied|403/i.test(cosErrorText(err))
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label || 'COS 超时')), ms)
    Promise.resolve(promise).then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      }
    )
  })
}

async function putTencentSdk({ cosKey, buffer, mime }) {
  const cos = createClient()
  const metaFileId = await encodeMetaFileId(cosKey)
  return new Promise((resolve, reject) => {
    const payload = {
      Bucket: COS_BUCKET,
      Region: COS_REGION,
      Key: cosKey,
      Body: buffer,
      ContentType: mime || 'application/octet-stream',
      Headers: metaFileId ? { 'x-cos-meta-fileid': metaFileId } : undefined,
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
        credSource: lastCredSource,
      })
    }
    cos.putObject(payload, (err, data) => {
      if (err) return reject(err)
      finish(data)
    })
  })
}

async function saveDbFallback(cosKey, buffer, mime, reason) {
  const saved = await blob().putBlobAsync({ cosKey, buffer, mime })
  return {
    cosKey,
    path: relativeUrl(cosKey),
    url: relativeUrl(cosKey),
    etag: saved.etag,
    mime,
    bytes: buffer.length,
    mode: 'db-fallback',
    warning: reason,
  }
}

function httpGetBuffer(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http
    const req = lib.get(url, { timeout: 8000 }, (res) => {
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
  if (Date.now() < cosSkipUntil) {
    return saveDbFallback(cosKey, buffer, mime, 'COS 近期无权限，已直接写入数据库')
  }
  try {
    const put = await withTimeout(putTencentSdk({ cosKey, buffer, mime }), 12000, 'COS 超时')
    try {
      await blob().putBlobAsync({ cosKey, buffer, mime })
    } catch (_) {}
    cosSkipUntil = 0
    return put
  } catch (e) {
    const msg = cosErrorText(e) || 'COS 上传失败'
    if (isCosDenied(e) || /超时|getauth/i.test(msg)) {
      cosSkipUntil = Date.now() + 10 * 60 * 1000
    }
    console.warn('[cos] putObject fail, fallback media_blob:', msg)
    try {
      return await saveDbFallback(cosKey, buffer, mime, `COS 不可用（${msg}），已写入数据库，预览走媒体代理`)
    } catch (e2) {
      console.error('[cos] media_blob fallback failed:', e2 && e2.message)
      const err = new Error(
        `COS 上传失败：${msg}；数据库回落亦失败：${e2.message}。请检查云托管开放接口 /_/cos/getauth`
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

  // 1) DB 回落（最快且不依赖 COS 权限；必须 async，禁止 deasync）
  try {
    const fromDb = await blob().getBlobAsync(cosKey)
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

  // 3) COS SDK（有超时；近期 Access Denied 则跳过，避免 /media/file 挂死）
  if (MODE === 'tencent' && Date.now() >= cosSkipUntil) {
    try {
      const cos = createClient()
      const data = await withTimeout(
        new Promise((resolve, reject) => {
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
        }),
        8000,
        'COS 读超时'
      )
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
        await blob().putBlobAsync({ cosKey, buffer, mime: out.mime })
      } catch (_) {}
      return out
    } catch (e) {
      console.warn('[cos] getObject sdk fail:', e && e.message)
      if (isCosDenied(e) || /超时|getauth/i.test(cosErrorText(e))) {
        cosSkipUntil = Date.now() + 10 * 60 * 1000
      }
    }

    // 4) CDN / 公网直链兜底（私有桶通常 403，快速失败）
    const candidates = []
    if (CDN_HOST) candidates.push(`${CDN_HOST}/${cosKey}`)
    if (COS_BUCKET && COS_REGION) {
      candidates.push(`https://${COS_BUCKET}.cos.${COS_REGION}.myqcloud.com/${cosKey}`)
    }
    for (const url of candidates) {
      try {
        const got = await withTimeout(httpGetBuffer(url), 8000, 'CDN 读超时')
        try {
          await blob().putBlobAsync({ cosKey, buffer: got.buffer, mime: got.mime })
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
      ? `媒体不存在或 COS 无权读取（key=${cosKey}）。请重新上传，或检查云托管开放接口 /_/cos/getauth`
      : '文件不存在'
  )
  err.code = 'ENOENT'
  err.status = 404
  throw err
}

/**
 * 官方：勿在服务启动阶段立刻云调用，旁路尚未就绪。
 * 延迟后再暖机；失败不致命，首次上传还会再试。
 */
function warmWxGetauthAsync() {
  if (MODE !== 'tencent' || !USE_WX_GETAUTH) return
  const delayMs = Number(process.env.COS_GETAUTH_WARM_DELAY_MS || 25000)
  setTimeout(() => {
    probeWxGetauth()
      .then((r) => {
        if (r.ok) console.log(`[cos] auth ready source=${lastCredSource} remote=${lastRemoteAddress}`)
        else console.warn('[cos] auth warm fail:', r.lastGetauthError)
      })
      .catch((e) => console.warn('[cos] auth warm fail:', e && e.message))
  }, delayMs)
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
  warmWxGetauthAsync,
  probeWxGetauth,
}
