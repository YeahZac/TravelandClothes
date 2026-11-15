/**
 * 统一邀请/差一点点分享 path（落地首页，带 invite + channel）
 */
import { session } from '../store/session.js'
import { USE_REMOTE, getToken } from '../api/request.js'
import { isLoggedIn } from '../api/auth.js'
import { apiRecordTaskAction } from '../api/growth.js'

const HOME = '/pages/home/index'
const PENDING_KEY = 'qmyx_share_payload'
let _lastShareReportAt = 0

/** 分享面板打开时记一次（限流交给服务端） */
function reportShareAction() {
  if (!(USE_REMOTE && getToken() && isLoggedIn())) return
  const now = Date.now()
  if (now - _lastShareReportAt < 1500) return
  _lastShareReportAt = now
  apiRecordTaskAction('share').catch(() => {})
}

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
  reportShareAction()
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
