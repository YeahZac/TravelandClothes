/**
 * 微信小程序登录：jscode2session
 * AppID 沿用同袍会小程序 wx5326b85f57306b84
 */
const DEFAULT_APPID = 'wx5326b85f57306b84'

function wxConfig() {
  return {
    appId: process.env.WX_APPID || DEFAULT_APPID,
    secret: process.env.WX_SECRET || '',
    allowDemo: process.env.ALLOW_DEMO_LOGIN === '1' || process.env.ALLOW_DEMO_LOGIN === 'true',
  }
}

/**
 * @param {string} code uni.login 拿到的 js_code
 * @returns {Promise<{openid:string, session_key:string, unionid?:string, demo?:boolean}>}
 */
async function code2Session(code) {
  const cfg = wxConfig()
  if (!code) throw new Error('缺少登录 code')

  // 开发态兜底：未配 Secret 或显式 demo
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

  const path =
    `/sns/jscode2session` +
    `?appid=${encodeURIComponent(cfg.appId)}` +
    `&secret=${encodeURIComponent(cfg.secret)}` +
    `&js_code=${encodeURIComponent(code)}` +
    `&grant_type=authorization_code`

  // 云托管内 native fetch 偶发失败，改用 https 直连
  const data = await new Promise((resolve, reject) => {
    const https = require('https')
    const req = https.request(
      {
        hostname: 'api.weixin.qq.com',
        path,
        method: 'GET',
        timeout: 10000,
      },
      (res) => {
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
      }
    )
    req.on('error', (e) => reject(new Error(`微信登录网络失败: ${e.message}`)))
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('微信登录超时'))
    })
    req.end()
  })

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
}
