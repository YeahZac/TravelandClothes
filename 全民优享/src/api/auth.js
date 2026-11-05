import { request, setToken, getToken, USE_REMOTE } from './request.js'

export async function loginWithCode(platform = 'mp-weixin') {
  if (!USE_REMOTE) {
    return { token: '', user: null, wallet: null, from: 'offline' }
  }
  let code = 'demo'
  try {
    // #ifdef MP-WEIXIN
    const wxLogin = await new Promise((resolve, reject) => {
      uni.login({ provider: 'weixin', success: resolve, fail: reject })
    })
    if (wxLogin && wxLogin.code) code = wxLogin.code
    // #endif
  } catch (e) {
    console.warn('[auth] uni.login failed, use demo code', e)
  }
  const data = await request('/api/traffic/v1/auth/login', {
    method: 'POST',
    data: { platform, code },
  })
  if (data && data.token) setToken(data.token)
  return { ...data, from: 'remote' }
}

export async function ensureSession(platform = 'mp-weixin') {
  if (getToken()) {
    try {
      const me = await request('/api/traffic/v1/me')
      return { token: getToken(), ...me, from: 'token' }
    } catch (e) {
      setToken('')
    }
  }
  return loginWithCode(platform)
}

export { getToken, setToken }
