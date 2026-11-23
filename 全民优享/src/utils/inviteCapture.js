/**
 * 从启动/分享/小程序码 scene 捕获邀请码，写入 pending 供登录绑定。
 * 年会签到码 scene 形如 gXXXX（g + 场次码），绝不能当成邀请码。
 */
import { parseQuery } from './queryString.js'

const PENDING_INVITE = 'qmyx_pending_invite'
const PENDING_CHANNEL = 'qmyx_pending_channel'
const GALA_CODE_KEY = 'qmyx_gala_code'

/**
 * 年会无限制码 scene：g + 场次码（与 galaRoutes / galaApi.parseGalaScene 对齐）
 * 微信侧偶发把 scene 整段大写成 GXXXX，必须一并识别。
 */
export function isGalaScene(sceneRaw) {
  let raw = String(sceneRaw || '').trim()
  if (!raw) return false
  try {
    raw = decodeURIComponent(raw)
  } catch (_) {}
  if (/^g[A-Za-z0-9]{3,31}$/i.test(raw)) return true
  if (/(?:^|[?&])code=[A-Za-z0-9]+/i.test(raw)) return true
  return false
}

/** 与后端 inviteService 一致；拒绝 -1 / 场景值数字等脏数据 */
export function normalizeInviteCode(raw) {
  const c = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
  if (!c || c.length < 4 || c.length > 16) return ''
  if (/^\d+$/.test(c)) return ''
  return c
}

function readGalaPendingCode() {
  try {
    return String(uni.getStorageSync(GALA_CODE_KEY) || '')
      .trim()
      .toUpperCase()
  } catch (_) {
    return ''
  }
}

/** 是否像「把年会 scene/场次码误存成的邀请码」 */
function looksLikeGalaMistakenInvite(code) {
  const c = normalizeInviteCode(code)
  if (!c) return false
  if (isGalaScene(c) || isGalaScene(String(code || '').trim())) return true
  const gala = readGalaPendingCode()
  if (!gala) return false
  // scene gJUMN64 → 误存 GJUMN64；或直接存了场次码
  return c === gala || c === `G${gala}`
}

export function savePendingInvite(code, channel) {
  if (isGalaScene(code) || looksLikeGalaMistakenInvite(code)) return
  const c = normalizeInviteCode(code)
  if (!c) return
  try {
    uni.setStorageSync(PENDING_INVITE, c)
    if (channel) uni.setStorageSync(PENDING_CHANNEL, String(channel))
  } catch (e) {}
}

export function readPendingInviteCode() {
  try {
    const raw = uni.getStorageSync(PENDING_INVITE) || ''
    if (looksLikeGalaMistakenInvite(raw)) {
      clearPendingInvite()
      return ''
    }
    const c = normalizeInviteCode(raw)
    if (!c) {
      try {
        uni.removeStorageSync(PENDING_INVITE)
      } catch (_) {}
      return ''
    }
    return c
  } catch (e) {
    return ''
  }
}

export function clearPendingInvite() {
  try {
    uni.removeStorageSync(PENDING_INVITE)
  } catch (_) {}
}

/** 解析无限制小程序码 scene：i=YXABC123；年会 gXXXX 直接忽略 */
export function parseInviteScene(sceneRaw) {
  let raw = String(sceneRaw || '').trim()
  if (!raw) return ''
  try {
    raw = decodeURIComponent(raw)
  } catch (_) {}
  if (isGalaScene(raw)) return ''
  const m = raw.match(/(?:^|[?&])(?:i|invite)=([A-Za-z0-9]+)/i)
  if (m) return normalizeInviteCode(m[1] || '')
  // 裸字符串：年会 scene（含大写）一律不当邀请码
  if (/^g[A-Za-z0-9]{3,31}$/i.test(raw)) return ''
  const bare = raw.match(/^([A-Za-z0-9]{4,16})$/)
  if (bare) {
    if (/^g[A-Za-z0-9]{3,31}$/i.test(bare[1])) return ''
    return normalizeInviteCode(bare[1] || '')
  }
  try {
    const q = parseQuery(raw.includes('=') ? raw : `i=${raw}`)
    if (q.code && !q.i && !q.invite) return ''
    return normalizeInviteCode(q.i || q.invite || '')
  } catch (_) {
    return ''
  }
}

/** App onLaunch / onShow */
export function captureInviteFromLaunch(options) {
  if (!options) return
  const q = options.query || {}
  // 年会扫码 / 带场次 code：清掉误写入的邀请码
  if ((q.scene && isGalaScene(q.scene)) || (q.code && !q.invite && !q.i)) {
    clearPendingInvite()
    if (q.scene && isGalaScene(q.scene)) return
  }
  if (options.scene != null && String(options.scene).length > 0 && !/^\d+$/.test(String(options.scene))) {
    if (isGalaScene(options.scene)) {
      clearPendingInvite()
      return
    }
  }
  if (q.invite) savePendingInvite(q.invite, q.channel || 'share')
  if (q.channel && !q.invite) {
    try {
      uni.setStorageSync(PENDING_CHANNEL, String(q.channel))
    } catch (e) {}
  }
  if (q.scene) {
    const code = parseInviteScene(q.scene)
    if (code) savePendingInvite(code, q.channel || 'qrcode')
  }
  if (options.scene != null && String(options.scene).length > 0) {
    const top = String(options.scene)
    if (!/^\d+$/.test(top)) {
      const code = parseInviteScene(top)
      if (code) savePendingInvite(code, 'qrcode')
    }
  }
}
