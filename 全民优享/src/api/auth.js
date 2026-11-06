import { request, setToken, getToken, USE_REMOTE } from './request.js'
import { session } from '../store/session.js'

const LOGGED_KEY = 'qmyx_logged_in'

export function isLoggedIn() {
  return !!(getToken() && uni.getStorageSync(LOGGED_KEY))
}

export function markLoggedIn(flag) {
  try {
    if (flag) uni.setStorageSync(LOGGED_KEY, '1')
    else uni.removeStorageSync(LOGGED_KEY)
  } catch (e) {}
}

export function applyAuthSession(data) {
  if (!data) return
  if (data.user) {
    Object.assign(session.user, {
      id: data.user.id,
      nickName: data.user.nickName || '微信用户',
      avatarUrl: data.user.avatarUrl || '',
      inviteCode: data.user.inviteCode,
      frozenInviteReward: data.user.frozenInviteReward || 0,
      validInviteCount: (data.invite && data.invite.validInviteCount) || 0,
      loggedIn: true,
    })
  }
  if (data.wallet) {
    session.user.energy = data.wallet.energy
    session.user.points = data.wallet.points
    session.user.coins = data.wallet.coins
    session.user.lotteryChance =
      data.wallet.lottery_chance != null ? data.wallet.lottery_chance : data.wallet.lotteryChance
  }
  if (data.checkin) {
    session.checkin.todayDone = !!data.checkin.todayDone
    session.checkin.streak = data.checkin.streak || 0
    session.checkin.dayIndex = data.checkin.dayIndex || session.checkin.dayIndex
  }
}

function readPendingInvite() {
  let inviteCode = ''
  let channel = 'organic'
  try {
    inviteCode = uni.getStorageSync('qmyx_pending_invite') || ''
    channel = uni.getStorageSync('qmyx_pending_channel') || 'organic'
  } catch (e) {}
  return { inviteCode, channel }
}

/**
 * 微信登录：uni.login 取 code → 服务端 code2session
 * @param {{ nickName?: string, avatarUrl?: string, agreeLegal?: boolean, tosVersion?: string, privacyVersion?: string }} profile
 */
export async function loginWithWeChat(profile = {}) {
  if (!profile.agreeLegal) {
    throw new Error('请先勾选并同意用户协议与隐私政策')
  }
  if (!USE_REMOTE) {
    session.user.loggedIn = true
    session.user.nickName = profile.nickName || session.user.nickName || '本地用户'
    markLoggedIn(true)
    return { token: '', user: session.user, from: 'offline' }
  }

  let code = ''
  try {
    // #ifdef MP-WEIXIN
    const wxLogin = await new Promise((resolve, reject) => {
      uni.login({ provider: 'weixin', success: resolve, fail: reject })
    })
    if (wxLogin && wxLogin.code) code = wxLogin.code
    // #endif
    // #ifndef MP-WEIXIN
    code = 'demo'
    // #endif
  } catch (e) {
    console.warn('[auth] uni.login failed', e)
    throw new Error('微信登录失败，请重试')
  }
  if (!code) throw new Error('未获取到微信登录凭证')

  const { inviteCode, channel } = readPendingInvite()
  const data = await request('/api/traffic/v1/auth/login', {
    method: 'POST',
    data: {
      platform: 'mp-weixin',
      code,
      inviteCode,
      channel,
      nickName: profile.nickName || '',
      avatarUrl: profile.avatarUrl || '',
      agreeLegal: true,
      tosVersion: profile.tosVersion || '',
      privacyVersion: profile.privacyVersion || '',
    },
  })
  if (data && data.token) setToken(data.token)
  markLoggedIn(true)
  applyAuthSession(data)
  if (data && data.inviteBind && data.inviteBind.ok) {
    try {
      uni.removeStorageSync('qmyx_pending_invite')
    } catch (e) {}
  }
  return { ...data, from: 'remote' }
}

/** 仅恢复已有 token；没有 token 不自动静默登录 */
export async function restoreSession() {
  if (!USE_REMOTE) return { from: 'offline', loggedIn: false }
  if (!getToken()) {
    markLoggedIn(false)
    session.user.loggedIn = false
    return { from: 'guest', loggedIn: false }
  }
  try {
    const me = await request('/api/traffic/v1/me')
    markLoggedIn(true)
    applyAuthSession({ ...me, user: { ...(me.user || {}), loggedIn: true } })
    return { token: getToken(), ...me, from: 'token', loggedIn: true }
  } catch (e) {
    setToken('')
    markLoggedIn(false)
    session.user.loggedIn = false
    return { from: 'expired', loggedIn: false }
  }
}

export async function updateProfile(profile = {}) {
  const data = await request('/api/traffic/v1/auth/profile', {
    method: 'POST',
    data: {
      nickName: profile.nickName,
      avatarUrl: profile.avatarUrl,
    },
  })
  applyAuthSession(data)
  return data
}

export async function logout() {
  try {
    if (USE_REMOTE && getToken()) {
      await request('/api/traffic/v1/auth/logout', { method: 'POST', data: {} }).catch(() => {})
    }
  } finally {
    setToken('')
    markLoggedIn(false)
    session.user.loggedIn = false
    session.user.nickName = '点击登录'
    session.user.avatarUrl = ''
    session.user.id = ''
  }
}

/** @deprecated 用 loginWithWeChat；保留别名避免旧引用报错 */
export async function loginWithCode(platform = 'mp-weixin') {
  return loginWithWeChat()
}

export async function ensureSession(platform = 'mp-weixin') {
  const restored = await restoreSession()
  if (restored.loggedIn) return restored
  // 不再自动 demo 登录；交给登录页
  return { loggedIn: false, from: 'guest' }
}

export { getToken, setToken }
