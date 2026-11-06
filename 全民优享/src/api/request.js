/**
 * CMS 请求：
 * - 微信小程序：优先云托管 callContainer（同袍会 env + test-sever）
 * - 其它端 / 失败回退：HTTPS CMS_BASE
 */
export const CMS_BASE = 'https://linyitech.cloud'
export const USE_REMOTE = true

/** 同袍会云托管（与 utils/config.js 一致） */
export const CLOUD_ENV_ID = 'prod-d7gnz9s0j20275c05'
export const CLOUD_SERVICE = 'test-sever'

const TOKEN_KEY = 'qmyx_auth_token'

export function getToken() {
  try {
    return uni.getStorageSync(TOKEN_KEY) || ''
  } catch (e) {
    return ''
  }
}

export function setToken(token) {
  try {
    if (token) uni.setStorageSync(TOKEN_KEY, token)
    else uni.removeStorageSync(TOKEN_KEY)
  } catch (e) {}
}

function authHeader(extra = {}) {
  const header = {
    'Content-Type': 'application/json',
    ...extra,
  }
  const token = getToken()
  if (token) header.Authorization = `Bearer ${token}`
  return header
}

function viaHttps(path, options = {}) {
  return new Promise((resolve, reject) => {
    uni.request({
      url: `${CMS_BASE}${path}`,
      method: options.method || 'GET',
      data: options.data,
      header: authHeader(options.header),
      timeout: options.timeout || 12000,
      success(res) {
        const body = res.data
        if (body && body.code === 304) {
          resolve({ __unchanged: true, ...(body.data || {}) })
          return
        }
        if (res.statusCode >= 200 && res.statusCode < 300 && body && body.code === 0) {
          resolve(body.data)
        } else {
          reject(new Error((body && body.msg) || `HTTP ${res.statusCode}`))
        }
      },
      fail(err) {
        reject(err)
      },
    })
  })
}

function viaCallContainer(path, options = {}) {
  // #ifdef MP-WEIXIN
  return new Promise((resolve, reject) => {
    try {
      if (!wx.cloud || typeof wx.cloud.callContainer !== 'function') {
        reject(new Error('callContainer 不可用'))
        return
      }
      const method = (options.method || 'GET').toUpperCase()
      wx.cloud.callContainer({
        config: { env: CLOUD_ENV_ID },
        path,
        method,
        header: {
          ...authHeader(options.header),
          'X-WX-SERVICE': CLOUD_SERVICE,
        },
        data: method === 'GET' ? {} : options.data || {},
        timeout: options.timeout || 12000,
        success(res) {
          const body = res.data
          if (body && body.code === 304) {
            resolve({ __unchanged: true, ...(body.data || {}) })
            return
          }
          if (res.statusCode >= 200 && res.statusCode < 300 && body && body.code === 0) {
            resolve(body.data)
          } else {
            reject(new Error((body && body.msg) || `云托管 ${res.statusCode}`))
          }
        },
        fail(err) {
          reject(err || new Error('云托管调用失败'))
        },
      })
    } catch (e) {
      reject(e)
    }
  })
  // #endif
  // #ifndef MP-WEIXIN
  return Promise.reject(new Error('非微信端'))
  // #endif
}

export function request(path, options = {}) {
  // #ifdef MP-WEIXIN
  return viaCallContainer(path, options).catch((err) => {
    console.warn('[cms] callContainer 失败，回退 HTTPS', err && err.message)
    return viaHttps(path, options)
  })
  // #endif
  // #ifndef MP-WEIXIN
  return viaHttps(path, options)
  // #endif
}

export function actionId(prefix = 'act') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}
