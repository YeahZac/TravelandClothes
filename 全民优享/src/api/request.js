/** CMS 地址：真机请改为电脑局域网 IP */
export const CMS_BASE = 'http://127.0.0.1:3100'
export const USE_REMOTE = true

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

export function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const header = {
      'Content-Type': 'application/json',
      ...(options.header || {}),
    }
    const token = getToken()
    if (token) header.Authorization = `Bearer ${token}`

    uni.request({
      url: `${CMS_BASE}${path}`,
      method: options.method || 'GET',
      data: options.data,
      header,
      timeout: options.timeout || 8000,
      success(res) {
        const body = res.data
        // 304 not modified（业务 code）
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

export function actionId(prefix = 'act') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}
