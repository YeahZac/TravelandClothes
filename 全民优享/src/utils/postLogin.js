/**
 * 登录成功后的副作用：购物车同步、签到补拉、微信运动授权与步数上报。
 * 不放进 auth.js，避免与 cart 循环依赖，也不用动态 import（小程序编译会炸）。
 */
import { syncCartFromServer } from '../store/cart.js'
import { authorizeWeRun } from './werun.js'
import { maybeAutoSyncSteps } from './stepsAutoSync.js'
import { USE_REMOTE, getToken } from '../api/request.js'
import { isLoggedIn, syncCheckinAfterAuth } from '../api/auth.js'

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

/** 登录后强制同步今日步数（官方：prepare session → getWeRunData → sync） */
export async function syncStepsAfterAuth() {
  if (!(USE_REMOTE && getToken() && isLoggedIn())) return null
  return maybeAutoSyncSteps({
    force: true,
    silent: true,
    minIntervalMs: 0,
    requestAuth: true,
    allowMock: false,
  })
}

/**
 * @param {{ needCheckinSync?: boolean }} [opts]
 */
export async function runPostLoginSideEffects(opts = {}) {
  const needCheckin = !!opts.needCheckinSync
  await Promise.all([
    syncCartAfterAuth(),
    needCheckin
      ? syncCheckinAfterAuth().catch((e) => console.warn('[postLogin] checkin', e && e.message))
      : Promise.resolve(),
  ])
  // 延后：等 session_key 异步落库 + 避开首页 flash 抢带宽；仍带 code 解密
  setTimeout(() => {
    requestProductPermissions()
      .then((perm) => {
        if (perm && perm.ok) return syncStepsAfterAuth()
        return null
      })
      .catch((e) => console.warn('[postLogin] steps deferred', e && e.message))
  }, 1200)
  return { deferredSteps: true }
}
