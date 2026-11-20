import { request, setToken, getToken, USE_REMOTE } from './request.js'
import { session, resetToGuest } from '../store/session.js'
import { fetchCheckinStatus } from './growth.js'
import { pickAvatarStoragePath } from '../utils/uploadAvatar.js'

const LOGGED_KEY = 'qmyx_logged_in'

export function isLoggedIn() {
  const token = getToken()
  if (!token) return false
  try {
    if (!uni.getStorageSync(LOGGED_KEY)) {
      // token 还在但标记丢了：补回，避免每天被当成未登录
      markLoggedIn(true)
    }
  } catch (_) {
    markLoggedIn(true)
  }
  return true
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
  // 能量日不把历史实物凭证写进 session，避免首页 CTA 误跳第 7 天毛巾
  const dayIdx = Number(checkin.dayIndex != null ? checkin.dayIndex : session.checkin.dayIndex) || 1
  const rewards = Array.isArray(checkin.rewards) ? checkin.rewards : session.checkin.rewards || []
  const todayR = rewards.find((x) => Number(x.day) === dayIdx)
  const todayIsGift =
    todayR &&
    (todayR.type === 'gift' || todayR.type === 'physical' || todayR.type === 'product') &&
    todayR.giftId
  if (
    todayIsGift &&
    checkin.pendingGiftClaim &&
    checkin.pendingGiftClaim.claimToken &&
    String(checkin.pendingGiftClaim.productId || '').trim() === String(todayR.giftId).trim()
  ) {
    session.checkin.pendingGiftClaim = {
      claimToken: checkin.pendingGiftClaim.claimToken || '',
      productId: checkin.pendingGiftClaim.productId || '',
      name: checkin.pendingGiftClaim.name || '',
    }
  } else {
    session.checkin.pendingGiftClaim = null
  }
  if (Array.isArray(checkin.rewards) && checkin.rewards.length) {
    session.checkin.rewards = checkin.rewards.map((x) => ({
      day: x.day,
      label: x.label,
      type: x.type || 'energy',
      value: Number(x.value != null ? x.value : x.amount) || 0,
      amount: Number(x.amount != null ? x.amount : x.value) || 0,
      giftId: x.giftId || '',
      imageUrl: x.imageUrl || '',
      iconUrl: x.iconUrl || '',
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
      nickName: sanitizeNickName(data.user.nickName) || '优享用户',
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
export async function syncCheckinAfterAuth() {
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

/** uni.login 取 code；可与邀请码校验并行 */
export async function fetchWxLoginCode() {
  // #ifdef MP-WEIXIN
  try {
    const wxLogin = await Promise.race([
      new Promise((resolve, reject) => {
        uni.login({ provider: 'weixin', success: resolve, fail: reject })
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('uni.login timeout')), 8000)
      ),
    ])
    if (wxLogin && wxLogin.code) return wxLogin.code
  } catch (e) {
    console.warn('[auth] uni.login failed', e)
    const msg = String((e && e.message) || '')
    if (/timeout/i.test(msg)) throw new Error('微信登录超时，请重试')
    throw new Error('一键登录失败，请重试')
  }
  throw new Error('未获取到一键登录凭证')
  // #endif
  // #ifndef MP-WEIXIN
  return 'demo'
  // #endif
}

/**
 * 一键登录：uni.login 取 code → 服务端 code2session
 * @param {{ nickName?: string, avatarUrl?: string, gender?: string, agreeLegal?: boolean, tosVersion?: string, privacyVersion?: string, inviteCode?: string, code?: string }} profile
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

  let code = String(profile.code || '').trim()
  if (!code) code = await fetchWxLoginCode()
  if (!code) throw new Error('未获取到一键登录凭证')

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
  // preferHttps：避免 callContainer 先卡满再回退，串行可到 ~40s
  const data = await request('/api/traffic/v1/auth/session', {
    method: 'POST',
    preferHttps: true,
    timeout: 12000,
    cloudTimeout: 6000,
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
  // checkin 补拉不阻塞登录成功 UI，交给 postLogin 副作用
  // 无论绑定成败，登录后清 pending，避免误绑；登录页未填则之后不再展示入口
  try {
    uni.removeStorageSync('qmyx_pending_invite')
  } catch (e) {}
  return { ...data, from: 'remote', needCheckinSync: !data.checkin }
}

function isHardAuthFailure(err) {
  if (!err) return false
  const status = Number(err.statusCode || err.status || 0)
  const code = Number(err.code || 0)
  if (status === 503 || code === 503) return false
  if (status === 401 || code === 401) return true
  const msg = String(err.message || err.msg || '')
  // 繁忙/超时绝不当成掉登录
  if (/繁忙|timeout|超时|503|DB wall|云托管\s*503/i.test(msg)) return false
  return /未登录|token\s*无效|无效.*token|unauthorized|登录已过期/i.test(msg)
}

/**
 * Tab onShow 用：磁盘快照未过期则秒开，后台 SWR；过期才 await /me。
 * @param {{ maxAgeMs?: number }} [opts]
 */
export async function refreshMeIfStale(opts = {}) {
  const maxAgeMs = Math.max(5000, Number(opts.maxAgeMs) || 60 * 1000)
  if (!USE_REMOTE) return { from: 'offline', loggedIn: false }
  if (!getToken()) {
    markLoggedIn(false)
    resetToGuest()
    return { from: 'guest', loggedIn: false }
  }
  const cached = readAuthSnapshot()
  const age = cached && cached.at ? Date.now() - Number(cached.at) : Infinity
  if (cached) {
    markLoggedIn(true)
    session.user.loggedIn = true
    applyAuthSession({ ...cached, offline: true })
  } else {
    markLoggedIn(true)
    session.user.loggedIn = true
  }
  // 快照仍新鲜：后台轻量刷新，不阻塞 Tab 切换
  if (cached && age < maxAgeMs) {
    request('/api/traffic/v1/me', {
      preferHttps: true,
      timeout: 8000,
      cloudTimeout: 5000,
    })
      .then((me) => {
        markLoggedIn(true)
        applyAuthSession({ ...me, user: { ...(me.user || {}), loggedIn: true } })
      })
      .catch((e) => {
        if (isHardAuthFailure(e)) {
          setToken('')
          markLoggedIn(false)
          resetToGuest()
        }
      })
    return {
      from: 'cache',
      loggedIn: true,
      offline: true,
      token: getToken(),
      ...cached,
    }
  }
  return restoreSession()
}

/** 仅恢复已有 token；没有 token 不自动静默登录；网络失败不踢登录 */
export async function restoreSession() {
  if (!USE_REMOTE) return { from: 'offline', loggedIn: false }
  if (!getToken()) {
    markLoggedIn(false)
    resetToGuest()
    return { from: 'guest', loggedIn: false }
  }
  // 先本地缓存秒开登录态，避免 /me 503/超时时整页像「被踢下线」
  const cached = readAuthSnapshot()
  if (cached) {
    markLoggedIn(true)
    session.user.loggedIn = true
    applyAuthSession({ ...cached, offline: true })
  } else {
    markLoggedIn(true)
    session.user.loggedIn = true
  }
  try {
    const me = await request('/api/traffic/v1/me', {
      preferHttps: true,
      timeout: 8000,
      cloudTimeout: 5000,
    })
    markLoggedIn(true)
    applyAuthSession({ ...me, user: { ...(me.user || {}), loggedIn: true } })
    // 登录包/me 已带 checkin 则不再串行补拉
    if (!me.checkin) syncCheckinAfterAuth().catch(() => {})
    return { token: getToken(), ...me, from: 'token', loggedIn: true }
  } catch (e) {
    if (isHardAuthFailure(e)) {
      setToken('')
      markLoggedIn(false)
      resetToGuest()
      return { from: 'expired', loggedIn: false }
    }
    // 网络抖动 / 5xx：保留本地 token + 缓存
    markLoggedIn(true)
    session.user.loggedIn = true
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
