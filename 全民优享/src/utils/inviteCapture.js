/**
 * 从启动/分享/小程序码 scene 捕获邀请码，写入 pending 供登录绑定。
 */
import { parseQuery } from './queryString.js'

const PENDING_INVITE = 'qmyx_pending_invite'
const PENDING_CHANNEL = 'qmyx_pending_channel'

export function savePendingInvite(code, channel) {
  const c = String(code || '')
    .trim()
    .toUpperCase()
  if (!c) return
  try {
    uni.setStorageSync(PENDING_INVITE, c)
    if (channel) uni.setStorageSync(PENDING_CHANNEL, String(channel))
  } catch (e) {}
}

export function readPendingInviteCode() {
  try {
    return String(uni.getStorageSync(PENDING_INVITE) || '')
      .trim()
      .toUpperCase()
  } catch (e) {
    return ''
  }
}

/** 解析无限制小程序码 scene：i=YXABC123 */
export function parseInviteScene(sceneRaw) {
  let raw = String(sceneRaw || '').trim()
  if (!raw) return ''
  try {
    raw = decodeURIComponent(raw)
  } catch (_) {}
  const m =
    raw.match(/(?:^|[?&])(?:i|invite)=([A-Za-z0-9]+)/i) || raw.match(/^([A-Za-z0-9]{4,16})$/)
  if (m) return String(m[1] || '').toUpperCase()
  try {
    const q = parseQuery(raw.includes('=') ? raw : `i=${raw}`)
    return String(q.i || q.invite || '')
      .trim()
      .toUpperCase()
  } catch (_) {
    return ''
  }
}

/** App onLaunch / onShow */
export function captureInviteFromLaunch(options) {
  if (!options) return
  const q = options.query || {}
  if (q.invite) savePendingInvite(q.invite, q.channel || 'share')
  if (q.channel && !q.invite) {
    try {
      uni.setStorageSync(PENDING_CHANNEL, String(q.channel))
    } catch (e) {}
  }
  // 扫小程序码：scene 在 query.scene
  if (q.scene) {
    const code = parseInviteScene(q.scene)
    if (code) savePendingInvite(code, q.channel || 'qrcode')
  }
  // 兼容部分基础库把 scene 放在顶层
  if (options.scene != null && String(options.scene).length > 0) {
    const top = String(options.scene)
    // 数字 scene 是旧版二维码场景值，忽略；字符串才是无限制码参数
    if (!/^\d+$/.test(top)) {
      const code = parseInviteScene(top)
      if (code) savePendingInvite(code, 'qrcode')
    }
  }
}
