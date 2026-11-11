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
      timeout: timeoutMs,
      family,
      headers: { Accept: 'application/json' },
    }
    if (u.protocol === 'https:') {
      opts.rejectUnauthorized = rejectUnauthorized
    }
    const req = lib.request(opts, (res) => {
      let raw = ''
      res.on('data', (c) => {
        raw += c
      })
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw || '{}'))
        } catch (e) {
          reject(new Error(`微信登录响应解析失败: ${raw.slice(0, 120)}`))
        }
      })
    })
    req.on('error', (e) => reject(new Error(`微信登录网络失败: ${e.message}`)))
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('微信登录超时'))
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
      return await requestJson(url, { timeoutMs: 5000 })
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

module.exports = {
  wxConfig,
  code2Session,
  DEFAULT_APPID,
  inCloudContainer,
  openApiBase,
  BUILD_STAMP,
}
