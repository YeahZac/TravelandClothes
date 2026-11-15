/**
 * 微信小程序登录：jscode2session
 * AppID 沿用同袍会小程序 wx5326b85f57306b84
 *
 * 云托管容器内 HTTPS 出网常报 self-signed certificate。
 * 与 COS 一致：容器内只用微信开放接口 HTTP（http://api.weixin.qq.com），禁止 HTTPS。
 */
const http = require('http')
const https = require('https')

const DEFAULT_APPID = 'wx5326b85f57306b84'
const BUILD_STAMP = 'wxauth-http-20261111b'

function wxConfig() {
  return {
    appId: process.env.WX_APPID || DEFAULT_APPID,
    secret: process.env.WX_SECRET || '',
    allowDemo: process.env.ALLOW_DEMO_LOGIN === '1' || process.env.ALLOW_DEMO_LOGIN === 'true',
  }
}

function inCloudContainer() {
  return (
    String(process.env.PORT) === '80' ||
    process.env.COS_MODE === 'tencent' ||
    !!process.env.TENCENTCLOUD_SECRETID ||
    process.env.WX_OPENAPI_HTTP === '1' ||
    process.env.WX_OPENAPI_HTTP === 'true'
  )
}

function openApiBase() {
  const custom = String(process.env.WX_OPEN_API_HOST || '').trim().replace(/\/$/, '')
  // 容器内若误配 https://api.weixin.qq.com，强制改回 http，否则必踩自签证书
  if (inCloudContainer()) {
    if (!custom || /api\.weixin\.qq\.com/i.test(custom)) {
      return 'http://api.weixin.qq.com'
    }
    return custom
  }
  if (custom) return custom
  return 'https://api.weixin.qq.com'
}

function requestJson(url, { rejectUnauthorized = true, timeoutMs = 5000, family = 4 } = {}) {
  return new Promise((resolve, reject) => {
    let u
    try {
      u = new URL(url)
    } catch (e) {
      reject(new Error(`微信登录 URL 无效: ${url}`))
      return
    }
    const lib = u.protocol === 'https:' ? https : http
    const opts = {
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: `${u.pathname}${u.search}`,
      method: 'GET',
      family,
      headers: { Accept: 'application/json' },
    }
    if (u.protocol === 'https:') {
      opts.rejectUnauthorized = rejectUnauthorized
    }
    let settled = false
    const done = (fn, arg) => {
      if (settled) return
      settled = true
      fn(arg)
    }
    const req = lib.request(opts, (res) => {
      let raw = ''
      res.on('data', (c) => {
        raw += c
      })
      res.on('end', () => {
        try {
          done(resolve, JSON.parse(raw || '{}'))
        } catch (e) {
          done(reject, new Error(`微信登录响应解析失败: ${raw.slice(0, 120)}`))
        }
      })
    })
    req.on('error', (e) => done(reject, new Error(`微信登录网络失败: ${e.message}`)))
    // 双保险：options.timeout 在部分运行时不可靠
    req.setTimeout(timeoutMs, () => {
      req.destroy()
      done(reject, new Error('微信登录超时'))
    })
    req.end()
  })
}

async function fetchCode2Session(pathAndQuery) {
  const cloud = inCloudContainer()
  const bases = []
  const primary = openApiBase()
  bases.push(primary)
  if (cloud) {
    // 云托管：只允许 HTTP 开放接口，绝不碰 HTTPS（避免自签卡死/刷屏）
    if (!bases.includes('http://api.weixin.qq.com')) bases.push('http://api.weixin.qq.com')
  } else {
    if (!bases.includes('https://api.weixin.qq.com')) bases.push('https://api.weixin.qq.com')
  }

  let lastErr
  for (const base of bases) {
    if (cloud && base.startsWith('https:')) continue
    const url = `${base}${pathAndQuery}`
    try {
      if (base.startsWith('https:')) {
        try {
          return await requestJson(url, { rejectUnauthorized: true, timeoutMs: 5000 })
        } catch (e) {
          const msg = (e && e.message) || ''
          const tlsIssue = /self-signed|UNABLE_TO_VERIFY|CERT_|certificate/i.test(msg)
          if (!tlsIssue) throw e
          console.warn('[wxAuth] local HTTPS TLS fail, insecure retry:', msg)
          return await requestJson(url, { rejectUnauthorized: false, timeoutMs: 5000 })
        }
      }
      console.log(`[wxAuth] ${BUILD_STAMP} jscode2session via`, base)
      const data = await requestJson(url, { timeoutMs: 4000 })
      console.log(
        `[wxAuth] jscode2session ok openid=${data && data.openid ? 'yes' : 'no'} errcode=${
          (data && data.errcode) || 0
        }`
      )
      return data
    } catch (e) {
      lastErr = e
      console.warn('[wxAuth] jscode2session fail @', base, (e && e.message) || e)
    }
  }
  throw lastErr || new Error('微信登录网络失败')
}

/**
 * @param {string} code uni.login 拿到的 js_code
 * @returns {Promise<{openid:string, session_key:string, unionid?:string, demo?:boolean}>}
 */
async function code2Session(code) {
  const cfg = wxConfig()
  if (!code) throw new Error('缺少登录 code')

  if (!cfg.secret || code === 'demo') {
    if (!cfg.allowDemo && code !== 'demo') {
      throw new Error('服务端未配置 WX_SECRET，无法完成微信登录')
    }
    const crypto = require('crypto')
    const openid =
      code === 'demo'
        ? 'demo_openid'
        : `dev_${crypto.createHash('md5').update(code).digest('hex').slice(0, 16)}`
    return { openid, session_key: '', unionid: '', demo: true }
  }

  const pathAndQuery =
    `/sns/jscode2session` +
    `?appid=${encodeURIComponent(cfg.appId)}` +
    `&secret=${encodeURIComponent(cfg.secret)}` +
    `&js_code=${encodeURIComponent(code)}` +
    `&grant_type=authorization_code`

  const data = await fetchCode2Session(pathAndQuery)

  if (!data.openid) {
    const err = data.errmsg || JSON.stringify(data)
    throw new Error(`微信登录失败: ${err}`)
  }
  return {
    openid: data.openid,
    session_key: data.session_key || '',
    unionid: data.unionid || '',
    demo: false,
  }
}

let cachedToken = { value: '', expireAt: 0 }

function requestRaw(url, { method = 'GET', body = null, timeoutMs = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    let u
    try {
      u = new URL(url)
    } catch (e) {
      reject(new Error(`微信开放接口 URL 无效: ${url}`))
      return
    }
    const lib = u.protocol === 'https:' ? https : http
    const opts = {
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: `${u.pathname}${u.search}`,
      method,
      timeout: timeoutMs,
      family: 4,
      headers: { Accept: '*/*', 'Content-Type': 'application/json' },
    }
    if (u.protocol === 'https:') opts.rejectUnauthorized = !inCloudContainer()
    const req = lib.request(opts, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 0,
          headers: res.headers || {},
          buffer: Buffer.concat(chunks),
        })
      })
    })
    req.on('error', (e) => reject(new Error(`微信开放接口网络失败: ${e.message}`)))
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('微信开放接口超时'))
    })
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body))
    req.end()
  })
}

async function getAccessToken(force = false) {
  const cfg = wxConfig()
  if (!cfg.secret) throw new Error('服务端未配置 WX_SECRET')
  const now = Date.now()
  if (!force && cachedToken.value && cachedToken.expireAt > now + 60_000) {
    return cachedToken.value
  }
  const base = openApiBase()
  const url =
    `${base}/cgi-bin/token?grant_type=client_credential` +
    `&appid=${encodeURIComponent(cfg.appId)}&secret=${encodeURIComponent(cfg.secret)}`
  const raw = await requestRaw(url)
  let data = {}
  try {
    data = JSON.parse(raw.buffer.toString('utf8') || '{}')
  } catch (_) {
    throw new Error('获取 access_token 响应无效')
  }
  if (!data.access_token) {
    throw new Error(`获取 access_token 失败: ${data.errmsg || JSON.stringify(data)}`)
  }
  cachedToken = {
    value: data.access_token,
    expireAt: now + Math.max(60, Number(data.expires_in || 7200) - 120) * 1000,
  }
  return cachedToken.value
}

/**
 * 生成小程序码（无限制），返回 PNG Buffer
 * @param {{ scene: string, page?: string, envVersion?: string }} opts
 */
async function getWxaCodeUnlimited({ scene, page = 'pages/home/index', envVersion = '' } = {}) {
  const sc = String(scene || '').slice(0, 32)
  if (!sc) throw new Error('缺少 scene')
  const token = await getAccessToken()
  const base = openApiBase()
  const env =
    envVersion ||
    process.env.WX_QR_ENV_VERSION ||
    (process.env.NODE_ENV === 'production' ? 'release' : 'trial')
  const body = {
    scene: sc,
    page,
    check_path: false,
    env_version: env,
    width: 430,
  }
  const url = `${base}/wxa/getwxacodeunlimit?access_token=${encodeURIComponent(token)}`
  let raw = await requestRaw(url, { method: 'POST', body, timeoutMs: 15000 })
  const ctype = String((raw.headers && (raw.headers['content-type'] || raw.headers['Content-Type'])) || '')
  if (ctype.includes('application/json') || raw.buffer[0] === 0x7b) {
    let err = {}
    try {
      err = JSON.parse(raw.buffer.toString('utf8') || '{}')
    } catch (_) {}
    if (err.errcode === 40001 || err.errcode === 42001) {
      const token2 = await getAccessToken(true)
      const url2 = `${base}/wxa/getwxacodeunlimit?access_token=${encodeURIComponent(token2)}`
      raw = await requestRaw(url2, { method: 'POST', body, timeoutMs: 15000 })
      const ctype2 = String(
        (raw.headers && (raw.headers['content-type'] || raw.headers['Content-Type'])) || ''
      )
      if (ctype2.includes('application/json') || raw.buffer[0] === 0x7b) {
        try {
          err = JSON.parse(raw.buffer.toString('utf8') || '{}')
        } catch (_) {}
        throw new Error(`生成小程序码失败: ${err.errmsg || JSON.stringify(err)}`)
      }
    } else {
      throw new Error(`生成小程序码失败: ${err.errmsg || JSON.stringify(err)}`)
    }
  }
  return raw.buffer
}

module.exports = {
  wxConfig,
  code2Session,
  getAccessToken,
  getWxaCodeUnlimited,
  DEFAULT_APPID,
  inCloudContainer,
  openApiBase,
  BUILD_STAMP,
}
