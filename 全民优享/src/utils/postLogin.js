/**
 * 登录成功后的副作用：购物车同步、签到补拉、微信运动授权与步数上报。
 * 不放进 auth.js，避免与 cart 循环依赖，也不用动态 import（小程序编译会炸）。
 */
import { syncCartFromServer } from '../store/cart.js'
import { authorizeWeRun, getWeRunPayload } from './werun.js'
import { apiStepsSync } from '../api/growth.js'
import { USE_REMOTE, getToken } from '../api/request.js'
import { isLoggedIn, syncCheckinAfterAuth } from '../api/auth.js'
import { session } from '../store/session.js'

export async function syncCartAfterAuth() {
  try {
    await syncCartFromServer()
  } catch (e) {
    console.warn('[postLogin] cart', e && e.message)
  }
}

/** 申请本产品需要的系统权限（当前：微信运动） */
export async function requestProductPermissions() {
  try {
    return await authorizeWeRun()
  } catch (e) {
    console.warn('[postLogin] permissions', e && e.message)
    return { ok: false }
  }
}

/** 有权限则同步今日步数到服务端 */
export async function syncStepsAfterAuth() {
  if (!(USE_REMOTE && getToken() && isLoggedIn())) return null
  try {
    const wr = await getWeRunPayload()
    if (wr.needSetting) return { ok: false, needSetting: true, tip: wr.tip }
    if (wr.ok && wr.encryptedData && wr.iv) {
      const r = await apiStepsSync({
        encryptedData: wr.encryptedData,
        iv: wr.iv,
        source: wr.source || 'werun',
      })
      if (r && r.steps != null) session.user.stepsToday = r.steps
      return r
    }
    // 开发态/模拟器：可上报 mock 步数便于联调
    if (wr.mock && wr.steps != null) {
      const r = await apiStepsSync({ steps: wr.steps, source: wr.source || 'werun_mock' })
      if (r && r.steps != null) session.user.stepsToday = r.steps
      return r
    }
    return wr
  } catch (e) {
    console.warn('[postLogin] steps', e && e.message)
    return { ok: false, msg: e && e.message }
  }
}

/**
 * @param {{ needCheckinSync?: boolean }} [opts]
 */
export async function runPostLoginSideEffects(opts = {}) {
  const needCheckin = !!opts.needCheckinSync
  // 购物车与签到补拉并行，不阻塞登录 UI
  await Promise.all([
    syncCartAfterAuth(),
    needCheckin
      ? syncCheckinAfterAuth().catch((e) => console.warn('[postLogin] checkin', e && e.message))
      : Promise.resolve(),
  ])
  // 微信运动/步数延后，避免与首页 flash/steps 抢带宽
  setTimeout(() => {
    requestProductPermissions()
      .then((perm) => {
        if (perm && (perm.ok || perm.mock)) return syncStepsAfterAuth()
        return null
      })
      .catch((e) => console.warn('[postLogin] steps deferred', e && e.message))
  }, 0)
  return { deferredSteps: true }
}
