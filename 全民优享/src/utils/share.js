/**
 * 统一邀请/差一点点分享（好友 + 朋友圈）
 * Vue3 script setup 须在 pages.json 开 enableShareAppMessage / enableShareTimeline，
 * 并注册 onShareAppMessage / onShareTimeline，右上角菜单才会出现分享项。
 */
import { onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app'
import { session } from '../store/session.js'
import { appConfig } from '../store/appConfig.js'
import { USE_REMOTE, getToken } from '../api/request.js'
import { isLoggedIn } from '../api/auth.js'
import { apiRecordTaskAction } from '../api/growth.js'

const HOME = '/pages/home/index'
const PENDING_KEY = 'qmyx_share_payload'
let _lastShareReportAt = 0

const CHANNEL_TITLE = {
  share_home: '全民优享 · 做任务攒能量兑好礼',
  share_mall: '优享商城 · 能量值也能买好物',
  share_festival: '汉服节报名中 · 一起来广州',
  share_lottery: '幸运抽奖 · 能量值抽实物好礼',
  share_gift: '兑好礼 · 能量值换真礼',
  share_task: '每日任务 · 签到步数都能攒能量',
  share_energy: '每日任务 · 帮我点一下冲进度',
  share_invite: '邀请有礼 · 一起领能量',
  share_friends: '好友能量 · 来偷一瓢',
  share_nearmiss: '就差一口气，帮我吹一下？',
  share_steps: '步数兑能量 · 走路也能领奖',
  share_mine: '全民优享 · 一起来玩',
  share_product: '发现好物 · 优享商城',
  share_ticket: '汉服节票种 · 早鸟价看看',
  share_content: '值得一看 · 全民优享',
}

function brandName() {
  return (appConfig.brand && appConfig.brand.name) || '全民优享'
}

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

export function buildInviteQuery({ channel = 'share', from = '' } = {}) {
  const code = inviteCode()
  const q = [`invite=${encodeURIComponent(code)}`, `channel=${encodeURIComponent(channel)}`]
  if (from) q.push(`from=${encodeURIComponent(from)}`)
  return q.join('&')
}

export function buildInvitePath({ channel = 'share', from = '' } = {}) {
  return `${HOME}?${buildInviteQuery({ channel, from })}`
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

function defaultTitle(channel) {
  return CHANNEL_TITLE[channel] || `${brandName()} · 做任务攒能量兑好礼`
}

function normalizeFallback(fallback = {}) {
  const channel = fallback.channel || 'share'
  return {
    channel,
    title: fallback.title || defaultTitle(channel),
    path: fallback.path || buildInvitePath({ channel, from: fallback.from || '' }),
    imageUrl: fallback.imageUrl || '',
    from: fallback.from || '',
  }
}

/** 页面 onShareAppMessage 统一出口 */
export function resolveShareMessage(fallback = {}) {
  reportShareAction()
  const base = normalizeFallback(fallback)
  const pending = takePendingShare()
  if (pending && (pending.title || pending.path)) {
    return {
      title: pending.title || base.title,
      path: pending.path || base.path,
      imageUrl: pending.imageUrl || base.imageUrl || undefined,
    }
  }
  return {
    title: base.title,
    path: base.path,
    imageUrl: base.imageUrl || undefined,
  }
}

/**
 * 朋友圈：打开「当前页」+ query（不能自定义 path）
 * 邀请参数写入 query，App onShow 会 captureInviteFromLaunch。
 */
export function resolveShareTimeline(fallback = {}) {
  reportShareAction()
  const base = normalizeFallback(fallback)
  let query = buildInviteQuery({ channel: base.channel, from: base.from || 'timeline' })
  if (fallback.query) {
    const extra = String(fallback.query).replace(/^\?/, '')
    if (extra) query = `${extra}&${query}`
  }
  return {
    title: base.title,
    query,
    imageUrl: base.imageUrl || undefined,
  }
}

/**
 * 一页同时接通「发给好友」+「分享到朋友圈」
 * @param {object|(() => object)} optsOrFn channel / title / path / imageUrl / query / from
 */
export function usePageShare(optsOrFn) {
  const pick = () => {
    try {
      return typeof optsOrFn === 'function' ? optsOrFn() || {} : optsOrFn || {}
    } catch (e) {
      return {}
    }
  }
  onShareAppMessage(() => resolveShareMessage(pick()))
  onShareTimeline(() => resolveShareTimeline(pick()))
}
