/**
 * 步数自动同步：已授权用户进首页时静默同步，无需每次点「同步」。
 * 与手动同步共用：wx.login code + POST /steps/sync + 失效 status 缓存。
 */
import { USE_REMOTE, getToken, invalidateRequestCache } from '../api/request.js'
import { isLoggedIn, fetchWxLoginCode } from '../api/auth.js'
import { apiStepsSync } from '../api/growth.js'
import { getWeRunPayload, isWeRunGranted } from './werun.js'
import { session } from '../store/session.js'
import { chinaDayKey } from './chinaTime.js'

const LAST_AT_KEY = 'qmyx_steps_last_sync_at'
const LAST_DAY_KEY = 'qmyx_steps_last_sync_day'
const DEFAULT_THROTTLE_MS = 10 * 60 * 1000

let syncInflight = null

function readLastAt() {
  try {
    return Number(uni.getStorageSync(LAST_AT_KEY) || 0) || 0
  } catch (_) {
    return 0
  }
}

function readLastDay() {
  try {
    return String(uni.getStorageSync(LAST_DAY_KEY) || '')
  } catch (_) {
    return ''
  }
}

function markSynced() {
  try {
    uni.setStorageSync(LAST_AT_KEY, Date.now())
    uni.setStorageSync(LAST_DAY_KEY, chinaDayKey())
  } catch (_) {}
}

/**
 * @param {{ force?: boolean, silent?: boolean, minIntervalMs?: number, allowMock?: boolean }} [opts]
 */
export async function maybeAutoSyncSteps(opts = {}) {
  const force = !!opts.force
  const silent = opts.silent !== false
  const minIntervalMs = Math.max(
    0,
    Number(opts.minIntervalMs != null ? opts.minIntervalMs : DEFAULT_THROTTLE_MS) || 0
  )
  if (!(USE_REMOTE && getToken() && isLoggedIn())) {
    return { skipped: 'guest' }
  }
  const today = chinaDayKey()
  const lastAt = readLastAt()
  const lastDay = readLastDay()
  const dueByDay = lastDay !== today
  if (!force && !dueByDay && lastAt && Date.now() - lastAt < minIntervalMs) {
    return { skipped: 'throttle' }
  }
  if (syncInflight) return syncInflight

  syncInflight = (async () => {
    try {
      // 自动路径：已授权才同步，不弹系统授权框
      if (!force) {
        const granted = await isWeRunGranted()
        if (!granted) return { skipped: 'needSetting' }
      }
      // 必须先 wx.login 再取运动数据：wx.login 会换新 session_key，
      // 反序会让服务端拿新 key 解旧密文 → 「微信运动数据解密失败」
      let code = ''
      try {
        code = await fetchWxLoginCode()
      } catch (_) {}

      const wr = await getWeRunPayload({
        allowMock: opts.allowMock === true,
        skipAuthorize: !force,
      })
      if (wr.needSetting) return { skipped: 'needSetting', ...wr }
      if (!wr.ok && !wr.mock) return { skipped: 'werun', msg: wr.msg }

      const payload = wr.ok
        ? { encryptedData: wr.encryptedData, iv: wr.iv, source: wr.source || 'werun' }
        : { steps: Number(wr.steps) || 0, source: wr.source || 'werun_mock' }
      if (code) payload.code = code

      const synced = await apiStepsSync(payload)
      if (!synced || synced.ok === false) {
        return { ok: false, msg: (synced && synced.msg) || '同步失败' }
      }
      markSynced()
      invalidateRequestCache('/api/traffic/v1/steps/status')
      if (synced.steps != null) session.user.stepsToday = Number(synced.steps) || 0
      return { ok: true, ...synced, mock: !!wr.mock }
    } catch (e) {
      if (!silent) throw e
      const msg = String((e && e.message) || '同步失败')
      // 后台静默同步的软失败（服务忙、未授权、密钥过期）不该刷 console
      if (!/503|502|繁忙|稍后|授权|解密|重新登录|timeout|超时/.test(msg)) {
        console.warn('[stepsAutoSync]', msg)
      }
      return { ok: false, msg }
    } finally {
      syncInflight = null
    }
  })()

  return syncInflight
}
