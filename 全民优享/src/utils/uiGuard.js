/**
 * 轻量 UI / 系统信息兜底，抑制真机调试桥噪音与 WindowInfoChanged 监听泄漏。
 *
 * 1) toast/loading/tabBar：注入空 fail，避免 Uncaught (in promise) removeTextView
 * 2) getWindowInfo/getDeviceInfo/getAppBaseInfo：进程内只实读一次并缓存
 *    （基础库每次 getWindowInfo 都会加 WindowInfoChanged 监听 → 21 listeners 告警）
 */
const GUARDED = [
  'showToast',
  'hideToast',
  'showLoading',
  'hideLoading',
  'setTabBarItem',
  'setTabBarStyle',
  'showNavigationBarLoading',
  'hideNavigationBarLoading',
  'stopPullDownRefresh',
]

const INFO_APIS = ['getWindowInfo', 'getDeviceInfo', 'getAppBaseInfo']

let installed = false
const infoCache = Object.create(null)

function noop() {}

function wrapFailSafe(api, name) {
  if (typeof api !== 'function' || api.__uiGuarded) return api
  const wrapped = function (opts) {
    const o = Object.assign({}, opts || {})
    if (!o.success && !o.fail && !o.complete) o.fail = noop
    try {
      return api.call(this, o)
    } catch (e) {
      return undefined
    }
  }
  wrapped.__uiGuarded = true
  return wrapped
}

function wrapInfoOnce(api, name) {
  if (typeof api !== 'function' || api.__infoCached) return api
  const wrapped = function () {
    if (infoCache[name] != null) return infoCache[name]
    try {
      infoCache[name] = api.call(this) || {}
    } catch (e) {
      infoCache[name] = {}
    }
    return infoCache[name]
  }
  wrapped.__infoCached = true
  return wrapped
}

function patchHost(host) {
  if (!host) return
  GUARDED.forEach((name) => {
    try {
      if (typeof host[name] === 'function') host[name] = wrapFailSafe(host[name], name)
    } catch (_) {}
  })
  INFO_APIS.forEach((name) => {
    try {
      if (typeof host[name] === 'function') host[name] = wrapInfoOnce(host[name], name)
    } catch (_) {}
  })
}

export function installUiGuard() {
  if (installed) return
  installed = true
  try {
    if (typeof uni !== 'undefined') patchHost(uni)
  } catch (_) {}
  try {
    if (typeof wx !== 'undefined') patchHost(wx)
  } catch (_) {}
  try {
    if (typeof uni !== 'undefined' && typeof uni.onUnhandledRejection === 'function') {
      uni.onUnhandledRejection((ev) => {
        const msg = String(
          (ev && ev.reason && (ev.reason.errMsg || ev.reason.message)) || (ev && ev.reason) || ''
        )
        if (/no root view to removeBaseView|removeTextView|removeImageView|invalid call frame/i.test(msg)) {
          if (ev && typeof ev.preventDefault === 'function') ev.preventDefault()
          return true
        }
        return false
      })
    }
  } catch (_) {}
}

// 模块加载即安装，不等 onLaunch（否则首屏 vendor 已刷完 WindowInfoChanged）
try {
  installUiGuard()
} catch (_) {}
