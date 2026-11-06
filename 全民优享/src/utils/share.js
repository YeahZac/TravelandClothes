/**
 * 统一邀请/差一点点分享 path（落地首页，带 invite + channel）
 */
import { session } from '../store/session.js'

const HOME = '/pages/home/index'
const PENDING_KEY = 'qmyx_share_payload'

export function inviteCode() {
  return (session.user && session.user.inviteCode) || ''
}

export function buildInvitePath({ channel = 'share', from = '' } = {}) {
  const code = inviteCode()
  const q = [`invite=${encodeURIComponent(code)}`, `channel=${encodeURIComponent(channel)}`]
  if (from) q.push(`from=${encodeURIComponent(from)}`)
  return `${HOME}?${q.join('&')}`
}

export function setPendingShare(payload) {
  try {
    uni.setStorageSync(PENDING_KEY, JSON.stringify(payload || {}))
  } catch (e) {}
}

export function takePendingShare() {
  try {
    const raw = uni.getStorageSync(PENDING_KEY)
    uni.removeStorageSync(PENDING_KEY)
    if (!raw) return null
    return typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch (e) {
    return null
  }
}

/** 页面 onShareAppMessage 统一出口 */
export function resolveShareMessage(fallback = {}) {
  const pending = takePendingShare()
  if (pending && (pending.title || pending.path)) {
    return {
      title: pending.title || fallback.title || '帮我点一下，我差最后一口粮',
      path: pending.path || fallback.path || buildInvitePath({ channel: 'share' }),
    }
  }
  return {
    title: fallback.title || '帮我点一下，我差最后一口粮',
    path: fallback.path || buildInvitePath({ channel: fallback.channel || 'share' }),
  }
}
