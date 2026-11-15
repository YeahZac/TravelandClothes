import { request, setToken, getToken, USE_REMOTE } from './request.js'
import { session, resetToGuest } from '../store/session.js'
import { fetchCheckinStatus } from './growth.js'
import { pickAvatarStoragePath } from '../utils/uploadAvatar.js'

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

function applyCheckinPayload(checkin) {
  if (!checkin) return
  session.checkin.todayDone = !!checkin.todayDone
  session.checkin.streak = Number(checkin.streak) || 0
  if (checkin.dayIndex != null) session.checkin.dayIndex = Number(checkin.dayIndex) || 1
  if (Array.isArray(checkin.rewards) && checkin.rewards.length) {
    session.checkin.rewards = checkin.rewards.map((x) => ({
      day: x.day,
      label: x.label,
      type: x.type || 'energy',
      value: Number(x.value != null ? x.value : x.amount) || 0,
      amount: Number(x.amount != null ? x.amount : x.value) || 0,
    }))
  }
}

const ME_CACHE_KEY = 'qmyx_me_cache'

function cacheAuthSnapshot(data) {
  if (!data || !data.user) return
  try {
    uni.setStorageSync(
      ME_CACHE_KEY,
      JSON.stringify({
        user: data.user,
        wallet: data.wallet || null,
        checkin: data.checkin || null,
        invite: data.invite || null,
        at: Date.now(),
      })
    )
  } catch (e) {}
}

function readAuthSnapshot() {
  try {
    const raw = uni.getStorageSync(ME_CACHE_KEY)
    if (!raw) return null
    return typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch (e) {
    return null
  }
}

function sanitizeNickName(nick) {
  const n = String(nick || '').trim()
  // 「点击登录」曾误当访客昵称入库/缓存，登录后不能再当真实昵称展示
  if (!n || n === '点击登录' || n === '游客') return ''
  return n
}

export function applyAuthSession(data) {
  if (!data) return
  if (data.user) {
    // 只接受持久路径；勿回落到 chooseAvatar 临时路径，否则重启后空白
    const avatarUrl =
      pickAvatarStoragePath(data.user.avatarUrl) ||
      pickAvatarStoragePath(data.path) ||
      pickAvatarStoragePath(session.user.avatarUrl) ||
      ''
    Object.assign(session.user, {
      id: data.user.id,
      nickName: sanitizeNickName(data.user.nickName) || '微信用户',
      avatarUrl,
      gender: data.user.gender || session.user.gender || '',
      province: data.user.province || session.user.province || '',
      city: data.user.city || session.user.city || '',
      district: data.user.district || session.user.district || '',
      inviteCode: data.user.inviteCode,
      frozenInviteReward: data.user.frozenInviteReward || 0,
      validInviteCount: (data.invite && data.invite.validInviteCount) || 0,
      loggedIn: true,
    })
  }
  if (data.wallet) {
    session.user.energy = Number(data.wallet.energy) || 0
    session.user.points = Number(data.wallet.points) || 0
    session.user.coins = Number(data.wallet.coins) || 0
    session.user.lotteryChance =
      data.wallet.lottery_chance != null
        ? Number(data.wallet.lottery_chance) || 0
        : Number(data.wallet.lotteryChance) || 0
  }
  if (data.checkin) applyCheckinPayload(data.checkin)
  if (data.user && !data.offline) cacheAuthSnapshot(data)
}

/** 登录包若无 checkin，再拉一次状态，避免残留 mock 连签 */
async function syncCheckinAfterAuth() {
  if (!USE_REMOTE || !getToken()) return
  try {
    const st = await fetchCheckinStatus()
    if (st) applyCheckinPayload(st)
  } catch (e) {
    console.warn('[auth] checkin sync', e && e.message)
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
 * @param {{ nickName?: string, avatarUrl?: string, gender?: string, agreeLegal?: boolean, tosVersion?: string, privacyVersion?: string, inviteCode?: string }} profile
 */
export async function loginWithWeChat(profile = {}) {
  if (!profile.agreeLegal) {
    throw new Error('请先勾选并同意用户协议与隐私政策')
  }
  if (!USE_REMOTE) {
    session.user.loggedIn = true
    session.user.nickName = profile.nickName || session.user.nickName || '本地用户'
    session.user.avatarUrl =
      pickAvatarStoragePath(profile.avatarUrl) ||
      pickAvatarStoragePath(session.user.avatarUrl) ||
      ''
    session.user.gender = profile.gender || session.user.gender || ''
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

  const pending = readPendingInvite()
  // 登录页手填优先，其次扫码/分享写入的 pending
  const inviteCode = String(profile.inviteCode || pending.inviteCode || '')
    .trim()
    .toUpperCase()
  const channel = pending.channel || 'organic'
  if (inviteCode) {
    try {
      uni.setStorageSync('qmyx_pending_invite', inviteCode)
    } catch (e) {}
  }
  // 用 /auth/session：自定义域上 /auth/login 会被网关挂死；两端点服务端等价
  const data = await request('/api/traffic/v1/auth/session', {
    method: 'POST',
    timeout: 20000,
    data: {
      platform: 'mp-weixin',
      code,
      inviteCode,
      channel,
      nickName: profile.nickName || '',
      avatarUrl: profile.avatarUrl || '',
      gender: profile.gender || '',
      agreeLegal: true,
      tosVersion: profile.tosVersion || '',
      privacyVersion: profile.privacyVersion || '',
    },
  })
  if (data && data.token) setToken(data.token)
  markLoggedIn(true)
  // 写入服务端钱包/资料前，清掉访客残留（旧能量、mock 连签）
  resetToGuest()
  session.user.loggedIn = true
  applyAuthSession(data)
  if (!data.checkin) await syncCheckinAfterAuth()
  // 无论绑定成败，登录后清 pending，避免误绑；登录页未填则之后不再展示入口
  try {
    uni.removeStorageSync('qmyx_pending_invite')
  } catch (e) {}
  return { ...data, from: 'remote' }
}

function isHardAuthFailure(err) {
  if (!err) return false
  const status = Number(err.statusCode || err.status || 0)
  const code = Number(err.code || 0)
  if (status === 401 || code === 401) return true
  const msg = String(err.message || err.msg || '')
  return /未登录|token\s*无效|无效.*token|unauthorized|登录已过期/i.test(msg)
}

/** 仅恢复已有 token；没有 token 不自动静默登录；网络失败不踢登录 */
export async function restoreSession() {
  if (!USE_REMOTE) return { from: 'offline', loggedIn: false }
  if (!getToken()) {
    markLoggedIn(false)
    resetToGuest()
    return { from: 'guest', loggedIn: false }
  }
  try {
    const me = await request('/api/traffic/v1/me')
    markLoggedIn(true)
    applyAuthSession({ ...me, user: { ...(me.user || {}), loggedIn: true } })
    if (!me.checkin) await syncCheckinAfterAuth()
    return { token: getToken(), ...me, from: 'token', loggedIn: true }
  } catch (e) {
    if (isHardAuthFailure(e)) {
      setToken('')
      markLoggedIn(false)
      resetToGuest()
      return { from: 'expired', loggedIn: false }
    }
    // 网络抖动 / 5xx：保留本地 token，并用上次成功 /me 缓存撑起 UI
    markLoggedIn(true)
    session.user.loggedIn = true
    const cached = readAuthSnapshot()
    if (cached) applyAuthSession({ ...cached, offline: true })
    return {
      from: 'soft',
      loggedIn: true,
      offline: true,
      token: getToken(),
      ...(cached || {}),
    }
  }
}

export async function updateProfile(profile = {}) {
  const data = await request('/api/traffic/v1/auth/profile', {
    method: 'POST',
    data: {
      nickName: profile.nickName,
      avatarUrl: profile.avatarUrl,
      gender: profile.gender,
      province: profile.province,
      city: profile.city,
      district: profile.district,
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
    try {
      uni.removeStorageSync(ME_CACHE_KEY)
    } catch (e) {}
    resetToGuest()
  }
}

/** @deprecated 用 loginWithWeChat；保留别名避免旧引用报错 */
export async function loginWithCode(platform = 'mp-weixin') {
  return loginWithWeChat()
}

export async function ensureSession(platform = 'mp-weixin') {
  const restored = await restoreSession()
  if (restored.loggedIn) return restored
  return { loggedIn: false, from: 'guest' }
}

export { getToken, setToken }