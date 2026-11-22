/**
 * 微信运动步数自动同步（对齐官方文档）
 *
 * 官方要求：
 * 1. 需要 scope.werun 授权
 * 2. 调用 getWeRunData 前须先 wx.login
 * 3. 服务端用 code2Session 的 session_key 做 AES-128-CBC 解密
 * @see https://developers.weixin.qq.com/miniprogram/dev/api/open-api/werun/wx.getWeRunData.html
 * @see https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/signature.html
 *
 * 本实现严格分三步，避免「login 换 key 与密文不同步」：
 *   A. wx.login → POST /steps/prepare 落库 session_key
 *   B. wx.getWeRunData 取 encryptedData/iv（此时密文对应该 key）
 *   C. POST /steps/sync 仅传密文（不再夹带 code）
 */
import { USE_REMOTE, getToken, invalidateRequestCache } from '../api/request.js'
import { isLoggedIn, fetchWxLoginCode } from '../api/auth.js'
import { apiStepsPrepare, apiStepsSync } from '../api/growth.js'
import { getWeRunPayload, isWeRunGranted, authorizeWeRun, isDevtools } from './werun.js'
import { session } from '../store/session.js'
import { chinaDayKey } from './chinaTime.js'

const LAST_AT_KEY = 'qmyx_steps_last_sync_at'
const LAST_DAY_KEY = 'qmyx_steps_last_sync_day'
const DEFAULT_THROTTLE_MS = 45 * 1000

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

/** 官方步骤 A：login code → 服务端刷新 session_key */
async function prepareSessionKey() {
  const code = await fetchWxLoginCode()
  if (!code || code === 'demo') {
    return { ok: false, msg: '未获取到微信登录凭证' }
  }
  const r = await apiStepsPrepare({ code })
  if (!r || r.ok === false) {
    return { ok: false, msg: (r && r.msg) || '会话准备失败', needRelogin: true }
  }
  return { ok: true }
}

/**
 * @param {{ force?: boolean, silent?: boolean, minIntervalMs?: number, allowMock?: boolean, requestAuth?: boolean }} [opts]
 */
export async function maybeAutoSyncSteps(opts = {}) {
  const force = !!opts.force
  const silent = opts.silent !== false
  const requestAuth = !!opts.requestAuth
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
      let granted = await isWeRunGranted()
      if (!granted && (requestAuth || force)) {
        const auth = await authorizeWeRun()
        granted = !!(auth && auth.ok)
        if (!granted) {
          return { skipped: 'needSetting', needSetting: true, ...(auth || {}) }
        }
      }
      if (!granted) {
        return { skipped: 'needSetting', needSetting: true }
      }

      // 开发者工具无法读真实运动数据
      if (isDevtools() && opts.allowMock === true) {
        const wr = await getWeRunPayload({ allowMock: true, skipAuthorize: true })
        if (wr.mock) {
          const synced = await apiStepsSync({
            steps: Number(wr.steps) || 0,
            source: 'werun_mock',
          })
          if (!synced || synced.ok === false) {
            return { ok: false, msg: (synced && synced.msg) || '同步失败' }
          }
          markSynced()
          invalidateRequestCache('/api/traffic/v1/steps/status')
          if (synced.steps != null) session.user.stepsToday = Number(synced.steps) || 0
          return { ok: true, ...synced, mock: true }
        }
      }

      const runOnce = async () => {
        try {
          // A. 先落库 session_key（官方：getWeRunData 前须 login，且服务端 key 必须对齐）
          const prep = await prepareSessionKey()
          if (!prep.ok) return { ...prep, needRelogin: true }

          // B. 再取密文（加密使用刚刷新的 session_key）
          const wr = await getWeRunPayload({
            allowMock: false,
            skipAuthorize: true,
          })
          if (wr.needSetting) return { skipped: 'needSetting', ...wr }
          if (!wr.ok || !wr.encryptedData || !wr.iv) {
            return { ok: false, msg: (wr && wr.msg) || '未读到微信运动数据' }
          }

          // C. 仅传密文解密入库
          const synced = await apiStepsSync({
            encryptedData: wr.encryptedData,
            iv: wr.iv,
            source: wr.source || 'werun',
          })
          if (!synced || synced.ok === false) {
            const msg = (synced && synced.msg) || '同步失败'
            return {
              ok: false,
              msg,
              needRelogin: /解密|会话|重新登录|session/i.test(msg),
            }
          }
          markSynced()
          invalidateRequestCache('/api/traffic/v1/steps/status')
          if (synced.steps != null) session.user.stepsToday = Number(synced.steps) || 0
          return { ok: true, ...synced }
        } catch (e) {
          const msg = String((e && e.message) || '同步失败')
          return {
            ok: false,
            msg,
            needRelogin: /解密|会话|重新登录|session|登录凭证/i.test(msg),
          }
        }
      }

      let result = await runOnce()
      // 解密/会话失败再整链重试一次（session 竞态）
      if (result && result.ok === false && result.needRelogin) {
        result = await runOnce()
      }
      return result
    } catch (e) {
      if (!silent) throw e
      const msg = String((e && e.message) || '同步失败')
      if (!/503|502|繁忙|稍后|授权|解密|重新登录|timeout|超时|会话/.test(msg)) {
        console.warn('[stepsAutoSync]', msg)
      }
      return { ok: false, msg }
    } finally {
      syncInflight = null
    }
  })()

  return syncInflight
}
